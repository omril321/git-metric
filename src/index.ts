import _ from 'lodash';
import { copyProjectToTempDir, createTempArchivesDirectory, filterCommits, getGitCommitLogs, getSelectedStrategy, processProgramOptions } from './service';

export type ProgramOptions = {
    repositoryPath: string;
    maxCommitsCount?: number;
    commitsSince?: string;
    commitsUntil?: string;
    strategy: 'differential' | 'full-snapshot';
} & {
    task: 'count-files';
    metricNameToGlob: {[metricName: string]: string[]}; //map from the metric name to the globs that count it. e.g. `{'jsFiles': ['**/*.js', '**/*.jsx'], 'tsFiles': ['**/*.ts', '**/*.tsx'], }`
    ignoreModifiedFiles?: boolean; //ignored files which were only modified, and commits which only had modified files. When treating filenames only, modified-only files can be safely ignored, since they don't affect the metrics
}

export type ProcessedProgramOptions = ProgramOptions & {
    repositoryName: string,
    copiedRepositoryPath: string,
    tmpArchivesDirectoryPath: string,
}

process.on('unhandledRejection', error => {
    console.log('unhandledRejection', error && (error as any).message);
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

export async function run(options: ProgramOptions) {
    try {
        const processedOptions = processProgramOptions(options)
        await copyProjectToTempDir(processedOptions);
        await createTempArchivesDirectory(processedOptions);

        const commitsDetails = getGitCommitLogs(options);
        const filteredCommits = filterCommits(commitsDetails, Boolean(processedOptions.ignoreModifiedFiles));
        const strategy = getSelectedStrategy(processedOptions);
        const withMetrics = await strategy.calculateMetricsForCommits(filteredCommits);

        console.log(withMetrics.map((c) => ({ hash: c.commit.hash, metrics: c.metrics })));
        return withMetrics;
    } catch (e) {
        console.error(e);
        throw e;
    }
}

// const startTime = Date.now();
// run({
//     repositoryPath: path.resolve(__dirname, '..', 'testimio'),
//     strategy: 'differential',
//     task: 'count-files',
//     metricNameToGlob: {
//         jsFileCount: ['apps/clickim/**/*.js', 'apps/clickim/**/*.jsx'],
//         tsFileCount: ['apps/clickim/**/*.ts', 'apps/clickim/**/*.tsx'], //TODO: ignore d.ts files
//     },
//     commitsSince: '15-11-2020',
//     commitsUntil:'18-11-2021',
//     ignoreModifiedFiles: true,
//     maxCommitsCount: 50,
// }
// ).then(( metrics ) => {
//     console.log('donnnneeeeee', metrics.map((e) => e.metrics));
//     const endTiime = Date.now();
//     console.log('total time: ', Math.round((endTiime - startTime) / 1000), 'seconds');
// }).catch((err) => {
//     console.error('oh no, error: ', err);
// });