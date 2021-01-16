import { copyProjectToTempDir, createTempArchivesDirectory, filterCommits, getGitCommitLogs, getSelectedStrategy, processProgramOptions } from './service';
import { CommitWithMetrics } from './strategies';
import fse from 'fs-extra';
import git from 'isomorphic-git';
import { isFileInCommitContainsPhrase } from './gitUtils';
import _ from 'lodash';


export type TrackFileContenOptions = {
    [metricName: string]: {
        globs: string[];
        phrase: string;
    }
};
type StrategyType = 'differential' | 'full-snapshot';

export type ProgramOptions = {
    repositoryPath: string;
    maxCommitsCount?: number;
    commitsSince?: string;
    commitsUntil?: string;
    strategy?: StrategyType;
    trackByFileExtension?: {
        metricNameToGlobs: {[metricName: string]: string[]}; //map from the metric name to the globs that count it. e.g. `{'jsFiles': ['**/*.js', '**/*.jsx'], 'tsFiles': ['**/*.ts', '**/*.tsx'], }`
        ignoreModifiedFiles?: boolean; //ignored files which were only modified, and commits which only had modified files. When treating filenames only, modified-only files can be safely ignored, since they don't affect the metrics
    }
    trackByFileContent?: TrackFileContenOptions;
}

export type ProcessedProgramOptions = ProgramOptions & {
    repositoryName: string,
    copiedRepositoryPath: string,
    tmpArchivesDirectoryPath: string,
    ignoreModifiedFiles: boolean,
    trackByFileExtension: { //TODO: is there a more elegant way to reuse this property from the ProgramOptions? perhaps use Required
        metricNameToGlobs: {[metricName: string]: string[]};
    }
    trackByFileContent: TrackFileContenOptions;
    strategy: StrategyType;
}

process.on('unhandledRejection', error => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export async function run(options: ProgramOptions): Promise<CommitWithMetrics[]> {
    try {
        const processedOptions = processProgramOptions(options)
        await copyProjectToTempDir(processedOptions);
        await createTempArchivesDirectory(processedOptions);

        const commitsDetails = getGitCommitLogs(processedOptions);
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

const startTime = Date.now();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
const configWithFullSnapshot: ProgramOptions = {
    repositoryPath: path.resolve(__dirname, '..', 'testimio'),
    strategy: 'full-snapshot',
    trackByFileExtension: {
        metricNameToGlobs: {
            jsFileCount: ['apps/clickim/**/*.js', 'apps/clickim/**/*.jsx'],
            tsFileCount: ['apps/clickim/**/*.ts', 'apps/clickim/**/*.tsx'], //TODO: ignore d.ts files
        },
        ignoreModifiedFiles: true,
    },
    trackByFileContent: {
        'angularFiles': {
            globs: ['apps/clickim/src/**/*.js', 'apps/clickim/src/**/*.ts'],
            phrase: 'angular'
        },
        'reactFiles': {
            globs: ['apps/clickim/src/**/*.ts', 'apps/clickim/src/**/*.tsx'],
            phrase: 'react'
        },
    },
    commitsSince: '15-11-2020',
    commitsUntil: '18-11-2021',
    maxCommitsCount: 15,
};

const runWithConfigs = (config: ProgramOptions) => run(config).then(( metrics ) => {
    const endTiime = Date.now();
    console.log('done using strategy', config.strategy, 'total time: ', Math.round((endTiime - startTime) / 1000), 'seconds');
    return metrics.map((m) => m.metrics);
}).catch((err) => {

    console.error(`oh no, error from config ${config.strategy}: `, err);
});

const configWithDifferential = {...configWithFullSnapshot, strategy: 'differential' as const}
runWithConfigs(configWithFullSnapshot).then((fullResult) => {
    return runWithConfigs(configWithDifferential).then(diffResult => {
        if(!_.isEqual(fullResult, diffResult)) {
            console.log('bummer');
        }
    })
}
)
