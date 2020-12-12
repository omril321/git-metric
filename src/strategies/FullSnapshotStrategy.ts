import os from 'os';
import path from 'path';
import fse from 'fs-extra';
import * as child_process from 'child_process';
import { processAsPromise } from '../utils';
import { CommitDetails, CommitSnapshot, CommitWithMetrics } from '..';
import glob from 'glob';
import { MeasurementStrategy } from '.';

export interface FullSnapshotOptions {
    tmpArchivesDirPath: string;
    repositoryName: string;
    copiedProjectPath: string;
}

interface ClonedCommitDetails extends CommitDetails {
    cloneDestination: string;
}

export class FullSnapshotStrategy implements MeasurementStrategy {
    constructor(private options: FullSnapshotOptions) {
    }


    public async calculateMetricsForCommits(commits: CommitDetails[]): Promise<CommitWithMetrics[]> {
        await fse.emptyDir(this.options.tmpArchivesDirPath);
        return await Promise.all(commits.map((commit) => this.calculateMetricsForSingleCommit(commit)));
    }

    private async createCommitSnapshotUsingZip(commit: ClonedCommitDetails): Promise<void> {
        const { tmpArchivesDirPath, copiedProjectPath } = this.options;
        try {
            await fse.emptyDir(commit.cloneDestination);
            const tmpZipPath = path.resolve(tmpArchivesDirPath, `${commit.hash}.zip`);
            await processAsPromise(child_process.spawn('git', ['archive', '--format=zip', '-0', '-o', tmpZipPath, commit.hash], { cwd: copiedProjectPath }));

            await fse.emptyDir(commit.cloneDestination);
            await processAsPromise(child_process.spawn('unzip', ['-q', '-d', commit.cloneDestination, tmpZipPath], { cwd: tmpArchivesDirPath }));
        } catch (err) {
            throw err.toString();
        };
    }

    private async createCommitSnapshotAtDestination(commit: CommitDetails): Promise<CommitSnapshot> {
        const { repositoryName } = this.options;
        const withCloneDetails = { ...commit, cloneDestination: path.resolve(os.tmpdir(), repositoryName, commit.hash) };
        await this.createCommitSnapshotUsingZip(withCloneDetails);
        return withCloneDetails;
    }

    private mapCloneToMetric(clone: CommitSnapshot): CommitWithMetrics {
        const isEmpty = fse.readdirSync(clone.cloneDestination).length === 0;
        if (isEmpty) {
            throw new Error('attempt to collect metrics for an empty directory - this probably means that the archive process malfunctioned');
        }
        const jsFilesCount = glob.sync('apps/clickim/**/*.{js,jsx}', {cwd: clone.cloneDestination}).length;
        const tsFilesCount = glob.sync('apps/clickim/**/*.{ts,tsx}', {cwd: clone.cloneDestination}).length;
        const metrics = {
            jsFilesCount,
            tsFilesCount,
        }
        return {commit: clone, metrics };
    }

    public async calculateMetricsForSingleCommit(commit: CommitDetails): Promise<CommitWithMetrics> {
        const commitSnapshot = await this.createCommitSnapshotAtDestination(commit);
        return this.mapCloneToMetric(commitSnapshot);
    }

}
