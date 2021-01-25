import { filterCommits, getGitCommitLogs, processProgramOptions } from './service';
import { CommitWithMetrics } from './strategies';
import { FullSnapshotStrategy } from './strategies/FullSnapshotStrategy';

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

process.on('unhandledRejection', error => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.error('unhandledRejection', error && (error as any).message);
});

export interface CommitDetails {
    hash: string;
    subject: string;
    authorName: string;
    authorDate: string;
    authorEmail: string;
    status: string[];
    files: string[];
}

export async function run(options: ProgramOptions): Promise<CommitWithMetrics[]> {
    try {
        const processedOptions = processProgramOptions(options)

        const commitsDetails = getGitCommitLogs(processedOptions);
        const filteredCommits = filterCommits(commitsDetails, processedOptions.ignoreCommitsOnlyWithModifiedFiles);
        const strategy = new FullSnapshotStrategy(processedOptions);
        const withMetrics = await strategy.calculateMetricsForCommits(filteredCommits);

        console.debug(withMetrics.map((c) => ({ hash: c.commit.hash, metrics: c.metrics })));
        return withMetrics;
    } catch (e) {
        console.error(e);
        throw e;
    }
}

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

