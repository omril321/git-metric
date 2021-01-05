import os from 'os';
import path from 'path';
import fse from 'fs-extra';
import * as child_process from 'child_process';
import { processAsPromise } from '../utils';
import { CommitDetails, ProcessedProgramOptions } from '..';
import glob from 'glob';
import { CommitWithMetrics, MeasurementStrategy } from '.';
import _ from 'lodash';

export interface CommitSnapshot extends CommitDetails {
    cloneDestination: string;
}

interface ClonedCommitDetails extends CommitDetails {
    cloneDestination: string;
}

export class FullSnapshotStrategy implements MeasurementStrategy {
    constructor(private options: ProcessedProgramOptions) {
    }


    public async calculateMetricsForCommits(commits: CommitDetails[]): Promise<CommitWithMetrics[]> {
        await fse.emptyDir(this.options.tmpArchivesDirectoryPath);
        return await Promise.all(commits.map((commit) => this.calculateMetricsForSingleCommit(commit)));
    }

    private async createCommitSnapshotUsingZip(commit: ClonedCommitDetails): Promise<void> {
        const { tmpArchivesDirectoryPath, copiedRepositoryPath } = this.options;
        try {
            await fse.emptyDir(commit.cloneDestination);
            const tmpZipPath = path.resolve(tmpArchivesDirectoryPath, `${commit.hash}.zip`);
            await processAsPromise(child_process.spawn('git', ['archive', '--format=zip', '-0', '-o', tmpZipPath, commit.hash], { cwd: copiedRepositoryPath }));

            await fse.emptyDir(commit.cloneDestination);
            await processAsPromise(child_process.spawn('unzip', ['-q', '-d', commit.cloneDestination, tmpZipPath], { cwd: tmpArchivesDirectoryPath }));
        } catch (err) {
            throw err.toString();
        }
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

        const metrics = _.mapValues(this.options.trackByFileExtension.metricNameToGlob, (metricFileGlobs) => {
            return _.sumBy(metricFileGlobs, metricFileGlob => glob.sync(metricFileGlob, {cwd: clone.cloneDestination}).length);
        });
        return {commit: clone, metrics };
    }

    public async calculateMetricsForSingleCommit(commit: CommitDetails): Promise<CommitWithMetrics> {
        const commitSnapshot = await this.createCommitSnapshotAtDestination(commit);
        return this.mapCloneToMetric(commitSnapshot);
    }

}
