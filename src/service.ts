import _ from 'lodash';
import { CommitDetails, ProcessedProgramOptions, ProgramOptions } from '.';
import { MeasurementStrategy } from './strategies';
import { DifferentialStrategy } from './strategies/DifferentialStrategy';
import { FullSnapshotStrategy } from './strategies/FullSnapshotStrategy';
import * as os from 'os';
import * as path from 'path';
import * as fse from 'fs-extra';
import { buildFilesStringFromGlobs } from './utils';
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
    const copiedRepositoryPath = path.resolve(os.tmpdir(), `${repositoryName}_${Date.now()}`, 'root');
    const tmpArchivesDirectoryPath = path.resolve(os.tmpdir(), `${repositoryName}_${Date.now()}`, 'archives');
    const trackByFileExtension = options.trackByFileExtension || {};
    const trackByFileContent = options.trackByFileContent || {};
    const isTrackingByFileContent = !_.isEmpty(trackByFileContent);
    const ignoreCommitsOnlyWithModifiedFiles = !isTrackingByFileContent; //if tracking by file content, the optimization for tracking only modified files is irrelevant
    const strategy = isTrackingByFileContent ? 'full-snapshot' : 'differential' ; //differential mode is quicker, but isn't supported for trackByFileContent
    const allTrackedFileGlobs = _.flatten([...Object.values(trackByFileExtension), ...Object.values(trackByFileContent).map(({ globs }) => globs)]);

    return {
        ...options,
        repositoryName,
        copiedRepositoryPath,
        tmpArchivesDirectoryPath,
        trackByFileExtension,
        ignoreCommitsOnlyWithModifiedFiles,
        allTrackedFileGlobs,
        trackByFileContent,
        strategy
    };
}

export function filterCommits(commits: CommitDetails[], ignoreCommitsOnlyWithModifiedFiles: boolean): CommitDetails[] {
    if (ignoreCommitsOnlyWithModifiedFiles) {
        return commits.filter(commit => commit.status.some(status => status !== 'M'));
    }
    return commits;
}


export async function copyProjectToTempDir(options: ProcessedProgramOptions): Promise<void> {
    const { copiedRepositoryPath, repositoryPath } = options;
    console.debug(`copying project from ${repositoryPath} to ${copiedRepositoryPath}...`);
    await fse.copy(repositoryPath, copiedRepositoryPath, { errorOnExist: true, recursive: true });
    console.debug(`successfully copied from ${repositoryPath} to ${copiedRepositoryPath}`);
}

export async function createTempArchivesDirectory(options: ProcessedProgramOptions): Promise<void> {
    const { tmpArchivesDirectoryPath } = options;
    console.debug(`creating temporary archives directory at ${tmpArchivesDirectoryPath}...`);
    await fse.ensureDir(tmpArchivesDirectoryPath);
    console.debug(`successfully created temporary archives directory at ${tmpArchivesDirectoryPath}`);
}


export function getGitCommitLogs(options: ProcessedProgramOptions): CommitDetails[] {
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