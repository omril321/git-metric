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

    private getExtensionsMetrics(existingFolderPath: string): { [metric: string]: number } {
        return _.mapValues(this.options.trackByFileExtension.metricNameToGlobs, (metricFileGlobs) => {
            return _.sumBy(metricFileGlobs, metricFileGlob => glob.sync(metricFileGlob, {cwd: existingFolderPath}).length);
        });
    }

    private async getContentMetrics(existingFolderPath: string): Promise<{ [metric: string]: number }> {
        const getSingleMetricValue = async (globs: string[], phrase: string) => {
            const fileNamesToScan = _.chain(globs).map(filePattern => glob.sync(filePattern, {cwd: existingFolderPath, absolute: true})).flatten().value();
            const filesContainingPhrase = await Promise.all(fileNamesToScan.filter(async fileName => {
                const buffer = await fse.readFile(fileName);
                return buffer.includes(phrase);
            }));
            return filesContainingPhrase.length;
        }

        const result: { [metric: string]: number } = {};
        const promises = _.map(this.options.trackByFileContent, async ({globs, phrase}, metricName) => {
            const metricValue = await getSingleMetricValue(globs, phrase);
            result[metricName] = metricValue;
        });
        await Promise.all(promises);

        return result;
    }

    private async mapCloneToMetric(clone: CommitSnapshot): Promise<CommitWithMetrics> {
        const isEmpty = fse.readdirSync(clone.cloneDestination).length === 0;
        if (isEmpty) {
            throw new Error('attempt to collect metrics for an empty directory - this probably means that the archive process malfunctioned');
        }

        const extensionsMetrics = this.getExtensionsMetrics(clone.cloneDestination);
        const contentMetrics = await this.getContentMetrics(clone.cloneDestination);

        return { commit: clone, metrics: { ...extensionsMetrics, ...contentMetrics } };
    }

    public async calculateMetricsForSingleCommit(commit: CommitDetails): Promise<CommitWithMetrics> {
        const commitSnapshot = await this.createCommitSnapshotAtDestination(commit);
        return this.mapCloneToMetric(commitSnapshot);
    }

}
