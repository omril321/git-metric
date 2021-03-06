import gitlog from 'gitlog';
import { CommitWithMetrics, MeasurementService } from './MeasurementService';
import { buildFilesStringFromGlobs } from './utils';
import * as path from 'path';
import _ from 'lodash';


type TrackFileContenOptions = {
    [metricName: string]: {
        globs: string[];
        phrase: string;
    }
};

export type ProgramOptions = {
    repositoryPath: string;
    maxCommitsCount?: number;
    commitsSince?: string; //MM-DD-YYYY
    commitsUntil?: string; //MM-DD-YYYY
    trackByFileExtension?: {
        [metricName: string]: string[]; //map from the metric name to the globs that count it. e.g. `{'jsFiles': ['**/*.js', '**/*.jsx'], 'tsFiles': ['**/*.ts', '**/*.tsx'], }`
    }
    trackByFileContent?: TrackFileContenOptions;
}

export type ProcessedProgramOptions = ProgramOptions & {
    repositoryName: string,
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
    const allTrackedFileGlobs = _.flatten([...Object.values(trackByFileExtension), ...Object.values(trackByFileContent).map(({ globs }) => globs)]);

    return {
        ...options,
        repositoryName,
        trackByFileExtension,
        allTrackedFileGlobs,
        trackByFileContent
    };
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
        const strategy = new MeasurementService(processedOptions);
        return await strategy.calculateMetricsForCommits(commitsDetails);
    } catch (e) {
        console.error(e);
        throw e;
    }
}

process.on('unhandledRejection', error => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.error('unhandledRejection', error && (error as any).message);
});
