import os from 'os';
import path from 'path';
import fse from 'fs-extra';
import * as child_process from 'child_process';
import { processAsPromise } from '../utils';
import { CommitDetails, CommitSnapshot, CommitWithMetrics } from '..';
import glob from 'glob';

interface FullSnapshotOptions {
    archiveTool: 'tar' | 'zip'; //zip is quicker
    tmpArchivesDirPath: string;
    repositoryName: string;
    copiedProjectPath: string;
}

export class FullSnapshotStrategy {
    constructor(private options: FullSnapshotOptions) {
    }

    private async createCommitSnapshotUsingTar(commitHash: string, cloneDestination: string) {
        const { tmpArchivesDirPath, copiedProjectPath } = this.options;
        try {
            await fse.emptyDir(cloneDestination);
            const tmpTarPath = path.resolve(this.options.tmpArchivesDirPath, `${commitHash}.tar`);
            await processAsPromise(child_process.spawn('git', ['archive', '--format=tar', '-o', tmpTarPath, commitHash], { cwd: copiedProjectPath }));

            await fse.emptyDir(cloneDestination);
            await processAsPromise(child_process.spawn('tar', ['-zxf', tmpTarPath, '-C', cloneDestination], { cwd: tmpArchivesDirPath }));
        } catch (err) {
            throw err.toString();
        };
    }

    private async createCommitSnapshotUsingZip(commitHash: string, cloneDestination: string): Promise<void> {
        const { tmpArchivesDirPath, copiedProjectPath } = this.options;
        try {
            await fse.emptyDir(cloneDestination);
            const tmpZipPath = path.resolve(tmpArchivesDirPath, `${commitHash}.zip`);
            await processAsPromise(child_process.spawn('git', ['archive', '--format=zip', '-0', '-o', tmpZipPath, commitHash], { cwd: copiedProjectPath }));

            await fse.emptyDir(cloneDestination);
            await processAsPromise(child_process.spawn('unzip', ['-q', '-d', cloneDestination, tmpZipPath], { cwd: tmpArchivesDirPath }));
        } catch (err) {
            throw err.toString();
        };
    }

    private async createCommitSnapshotAtDestination(commit: CommitDetails): Promise<CommitSnapshot> {
        const { repositoryName, archiveTool } = this.options;
        const withCloneDetails = { ...commit, cloneDestination: path.resolve(os.tmpdir(), repositoryName, commit.hash) };
        if (archiveTool === 'tar') {
            await this.createCommitSnapshotUsingTar(withCloneDetails.hash, withCloneDetails.cloneDestination);
        }
        if (archiveTool === 'zip') {
            await this.createCommitSnapshotUsingZip(withCloneDetails.hash, withCloneDetails.cloneDestination);
        }
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

    private async handleSingleCommit(commit: CommitDetails): Promise<CommitWithMetrics> {
        const commitSnapshot = await this.createCommitSnapshotAtDestination(commit);
        const withMetrics = this.mapCloneToMetric(commitSnapshot);
        return withMetrics
    }

    public async calculateMetricsForCommits(commits: CommitDetails[]): Promise<CommitWithMetrics[]> {
        await fse.emptyDir(this.options.tmpArchivesDirPath);
        return await Promise.all(commits.map((commit) => this.handleSingleCommit(commit)));
    }
}
