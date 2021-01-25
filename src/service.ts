import _ from 'lodash';
import { CommitDetails, ProcessedProgramOptions, ProgramOptions } from '.';
import * as path from 'path';
import { buildFilesStringFromGlobs } from './utils';
import gitlog from 'gitlog';


export function processProgramOptions(options: ProgramOptions): ProcessedProgramOptions {
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

export function filterCommits(commits: CommitDetails[], ignoreCommitsOnlyWithModifiedFiles: boolean): CommitDetails[] {
    if (ignoreCommitsOnlyWithModifiedFiles) {
        return commits.filter(commit => commit.status.some(status => status !== 'M'));
    }
    return commits;
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
