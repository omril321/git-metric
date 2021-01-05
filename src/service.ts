import _ from 'lodash';
import { CommitDetails, ProcessedProgramOptions, ProgramOptions } from '.';
import { MeasurementStrategy } from './strategies';
import { DifferentialStrategy } from './strategies/DifferentialStrategy';
import { FullSnapshotStrategy } from './strategies/FullSnapshotStrategy';
import * as os from 'os';
import * as path from 'path';
import * as fse from 'fs-extra';
import { buildFilesStringFromMetricsToGlobsMap } from './utils';
import gitlog from 'gitlog';

export function getSelectedStrategy(options: ProcessedProgramOptions): MeasurementStrategy {
    switch(options.strategy) {
        case 'full-snapshot': return new FullSnapshotStrategy(options);
        case 'differential': return new DifferentialStrategy(options);
        default: throw new Error(`Unknown strategy: ${options.strategy}`)
    }
}


export function processProgramOptions(options: ProgramOptions): ProcessedProgramOptions {
    const repositoryName = path.basename(options.repositoryPath);
    const copiedRepositoryPath = path.resolve(os.tmpdir(), repositoryName, 'root');
    const tmpArchivesDirectoryPath = path.resolve(os.tmpdir(), repositoryName, 'archives');
    const trackByFileExtension = _.pick((options.trackByFileExtension || {metricNameToGlob: {}}), 'metricNameToGlob');
    const ignoreModifiedFiles = Boolean(options.trackByFileExtension?.ignoreModifiedFiles); //TODO: if tracking by by file content, should be true

    return {
        ...options,
        repositoryName,
        copiedRepositoryPath,
        tmpArchivesDirectoryPath,
        trackByFileExtension,
        ignoreModifiedFiles
    };
}

export function filterCommits(commits: CommitDetails[], ignoreModifiedFiles: boolean): CommitDetails[] {
    return ignoreModifiedFiles ?
        commits:
        commits.filter(commit => commit.status.some(status => status !== 'M'));
}


export async function copyProjectToTempDir(options: ProcessedProgramOptions): Promise<void> {
    const { copiedRepositoryPath, repositoryPath } = options;
    console.log(`copying project from ${repositoryPath} to ${copiedRepositoryPath}...`);
    await fse.copy(repositoryPath, copiedRepositoryPath, { errorOnExist: true, recursive: true });
    console.log(`successfully copied from ${repositoryPath} to ${copiedRepositoryPath}`);
}

export async function createTempArchivesDirectory(options: ProcessedProgramOptions): Promise<void> {
    const { tmpArchivesDirectoryPath } = options;
    console.log(`creating temporary archives directory at ${tmpArchivesDirectoryPath}...`);
    await fse.ensureDir(tmpArchivesDirectoryPath);
    console.log(`successfully created temporary archives directory at ${tmpArchivesDirectoryPath}`);
}


export function getGitCommitLogs(options: ProcessedProgramOptions): CommitDetails[] {
    //TODO: when adding "track by content", consider it here too.
    //TODO: another option: have an "all files glob" at the processed options
    const filesRegex = options.ignoreModifiedFiles ? buildFilesStringFromMetricsToGlobsMap(options.trackByFileExtension.metricNameToGlob) : undefined;
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