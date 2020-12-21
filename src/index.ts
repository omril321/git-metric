import os from 'os';
import fse from 'fs-extra';
import path from 'path';
import gitlog from "gitlog";
import { FullSnapshotOptions, FullSnapshotStrategy } from './strategies/FullSnapshotStrategy';
import { MeasurementStrategy } from './strategies';
import { DifferentialStrategy } from './strategies/DifferentialStrategy';
import _ from 'lodash';
import { buildFilesStringFromMetricsToGlobsMap } from './utils';

type ProgramOptions = {
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

export interface CommitSnapshot extends CommitDetails {
    cloneDestination: string;
}

export type CommitMetrics = {[metricName: string]: number};

export interface CommitWithMetrics {
    commit: CommitDetails,
    metrics: CommitMetrics;
}

async function copyProjectToTempDir(options: ProcessedProgramOptions) {
    const { copiedRepositoryPath, repositoryPath } = options;
    console.log(`copying project from ${repositoryPath} to ${copiedRepositoryPath}...`);
    await fse.copy(repositoryPath, copiedRepositoryPath, { errorOnExist: true, recursive: true });
    console.log(`successfully copied from ${repositoryPath} to ${copiedRepositoryPath}`);
}

async function createTempArchivesDirectory(options: ProcessedProgramOptions) {
    const { tmpArchivesDirectoryPath } = options;
    console.log(`creating temporary archives directory at ${tmpArchivesDirectoryPath}...`);
    await fse.ensureDir(tmpArchivesDirectoryPath);
    console.log(`successfully created temporary archives directory at ${tmpArchivesDirectoryPath}`);
}

function getCommitsDetails(options: ProgramOptions): CommitDetails[] {
    const filesRegex = options.ignoreModifiedFiles ? buildFilesStringFromMetricsToGlobsMap(options.metricNameToGlob) : undefined;
    const result = gitlog({
        repo: options.repositoryPath,
        since: options.commitsSince,
        until:  options.commitsUntil,
        number: options.maxCommitsCount,
        file: filesRegex,
        fields: ["hash", "subject", "authorName", "authorDate", "authorEmail"],
    });
    return result as unknown as (Omit<typeof result[0], 'status'> & {status: string[]})[]; //this hack bypasses a typing bug in gitlog
}

function filterCommits(commits: CommitDetails[], ignoreModifiedFiles?: boolean): CommitDetails[] {
    return ignoreModifiedFiles ?
        commits:
        commits.filter(commit => commit.status.some(status => status !== 'M'));
}

function getSelectedStrategy(options: ProcessedProgramOptions): MeasurementStrategy {
    const strategyOptions: FullSnapshotOptions = _.pick(options, 'repositoryName', 'copiedRepositoryPath', 'tmpArchivesDirectoryPath');
    switch(options.strategy) {
        case 'full-snapshot': return new FullSnapshotStrategy(strategyOptions);
        case 'differential': return new DifferentialStrategy(strategyOptions);
        default: throw new Error(`Unknown strategy: ${options.strategy}`)
    }
}

function processOptions(options: ProgramOptions): ProcessedProgramOptions {
    const repositoryName = path.basename(options.repositoryPath);
    const copiedRepositoryPath = path.resolve(os.tmpdir(), repositoryName, 'root');
    const tmpArchivesDirectoryPath = path.resolve(os.tmpdir(), repositoryName, 'archives');
    return {
        ...options,
        repositoryName,
        copiedRepositoryPath,
        tmpArchivesDirectoryPath,
    };
}

async function run(options: ProgramOptions) {
    try {
        const processedOptions = processOptions(options)
        await copyProjectToTempDir(processedOptions);
        await createTempArchivesDirectory(processedOptions);

        const commitsDetails = getCommitsDetails(options);
        const filteredCommits = filterCommits(commitsDetails);
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
run({
    repositoryPath: path.resolve(__dirname, '..', 'testimio'),
    strategy: 'differential',
    task: 'count-files',
    metricNameToGlob: {
        jsFileCount: ['apps/clickim/**/*.js', 'apps/clickim/**/*.jsx'],
        tsFileCount: ['apps/clickim/**/*.ts', 'apps/clickim/**/*.tsx'], //TODO: ignore d.ts files
    },
    commitsSince: '15-11-2020',
    commitsUntil:'18-11-2021',
    ignoreModifiedFiles: true,
    maxCommitsCount: 50,
}
).then(( metrics ) => {
    console.log('donnnneeeeee', metrics.map((e) => e.metrics));
    const endTiime = Date.now();
    console.log('total time: ', Math.round((endTiime - startTime) / 1000), 'seconds');
}).catch((err) => {
    console.error('oh no, error: ', err);
});