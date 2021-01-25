import gitlog from 'gitlog';
import { CommitWithMetrics, MeasurementService } from './MeasurementService';
import { buildFilesStringFromGlobs } from './utils';
import * as _ from 'lodash';
import * as path from 'path';

type TrackFileContenOptions = {
    [metricName: string]: {
        globs: string[];
        phrase: string;
    }
};

export type ProgramOptions = {
    repositoryPath: string;
    maxCommitsCount?: number;
    commitsSince?: string;
    commitsUntil?: string;
    trackByFileExtension?: {
        [metricName: string]: string[]; //map from the metric name to the globs that count it. e.g. `{'jsFiles': ['**/*.js', '**/*.jsx'], 'tsFiles': ['**/*.ts', '**/*.tsx'], }`
    }
    trackByFileContent?: TrackFileContenOptions;
}

export type ProcessedProgramOptions = ProgramOptions & {
    repositoryName: string,
    ignoreCommitsOnlyWithModifiedFiles: boolean,
    allTrackedFileGlobs: string[],
    trackByFileExtension: {
        [metricName: string]: string[];
    }
    trackByFileContent: TrackFileContenOptions;
}

export interface CommitDetails {
    hash: string;
    subject: string;
    authorName: string;
    authorDate: string;
    authorEmail: string;
    status: string[];
    files: string[];
}

function processProgramOptions(options: ProgramOptions): ProcessedProgramOptions {
    const repositoryName = path.basename(options.repositoryPath);
    const trackByFileExtension = options.trackByFileExtension || {};
    const trackByFileContent = options.trackByFileContent || {};
    const isTrackingByFileContent = !_.isEmpty(trackByFileContent);
    const ignoreCommitsOnlyWithModifiedFiles = !isTrackingByFileContent; //if tracking by file content, the optimization for tracking only modified files is irrelevant
    const allTrackedFileGlobs = _.flatten([...Object.values(trackByFileExtension), ...Object.values(trackByFileContent).map(({ globs }) => globs)]);

    return {
        ...options,
        repositoryName,
        trackByFileExtension,
        ignoreCommitsOnlyWithModifiedFiles,
        allTrackedFileGlobs,
        trackByFileContent
    };
}

function filterCommits(commits: CommitDetails[], ignoreCommitsOnlyWithModifiedFiles: boolean): CommitDetails[] {
    if (ignoreCommitsOnlyWithModifiedFiles) {
        return commits.filter(commit => commit.status.some(status => status !== 'M'));
    }
    return commits;
}

function getGitCommitLogs(options: ProcessedProgramOptions): CommitDetails[] {
    const filesString = buildFilesStringFromGlobs(options.allTrackedFileGlobs);
    const result = gitlog({
        repo: options.repositoryPath,
        since: options.commitsSince,
        until:  options.commitsUntil,
        number: options.maxCommitsCount,
        file: filesString,
        fields: ["hash", "subject", "authorName", "authorDate", "authorEmail"],
    });
    return result as unknown as (Omit<typeof result[0], 'status'> & {status: string[]})[]; //this hack bypasses a typing bug in gitlog
}

export async function run(options: ProgramOptions): Promise<CommitWithMetrics[]> {
    try {
        const processedOptions = processProgramOptions(options)

        const commitsDetails = getGitCommitLogs(processedOptions);
        const filteredCommits = filterCommits(commitsDetails, processedOptions.ignoreCommitsOnlyWithModifiedFiles);
        const strategy = new MeasurementService(processedOptions);
        return await strategy.calculateMetricsForCommits(filteredCommits);
    } catch (e) {
        console.error(e);
        throw e;
    }
}

process.on('unhandledRejection', error => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.error('unhandledRejection', error && (error as any).message);
});

// import path from 'path';
// const startTime = Date.now();
// run({
//     repositoryPath: path.resolve(__dirname, '..', 'testimio'),
//     trackByFileExtension: {
//         jsFileCount: ['apps/clickim/**/*.js', 'apps/clickim/**/*.jsx'],
//         tsFileCount: ['apps/clickim/**/*.ts', 'apps/clickim/**/*.tsx'], //TODO: ignore d.ts files
//     },
//     trackByFileContent: {
//         'angularFiles': {
//             globs: ['apps/clickim/src/**/*.js', 'apps/clickim/src/**/*.ts'],
//             phrase: 'angular'
//         },
//         'reactFiles': {
//             globs: ['apps/clickim/src/**/*.ts', 'apps/clickim/src/**/*.tsx'],
//             phrase: 'react'
//         },
//     },
//     commitsSince: '15-1-2020',
//     commitsUntil: '18-11-2021',
//     maxCommitsCount: 500,
// }
// ).then(( metrics ) => {
//     console.log('donnnneeeeee', metrics.map((e) => e.metrics));
//     const endTiime = Date.now();
//     console.log('total time: ', Math.round((endTiime - startTime) / 1000), 'seconds');
// }).catch((err) => {
//     console.error('oh no, error: ', err);
// });

