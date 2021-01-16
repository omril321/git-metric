import { CommitMetrics, CommitWithMetrics, MeasurementStrategy } from '.';
import { CommitDetails, ProcessedProgramOptions, TrackFileContenOptions } from '..';
import { FullSnapshotStrategy } from './FullSnapshotStrategy';
import globToRegExp from 'glob-to-regexp'
import { mapValues } from 'lodash';
import git from 'isomorphic-git';
import _ from 'lodash';
import fse from 'fs-extra';
import { isFileInCommitContainsPhrase } from '../gitUtils';

interface CommitWithDiffMetrics  {
    commit: CommitDetails;
    extensionsDiffFromPreviousCommit: CommitMetrics;
    contentDiffFromPreviousCommit: CommitMetrics;
}


export class DifferentialStrategy implements MeasurementStrategy {
    private isFileInCommitContainsPhrase = _.memoize(this.isFileInCommitContainsPhraseImpl, (...args) => args.join('_'));

    constructor(private options: ProcessedProgramOptions) {
    }

    public async calculateMetricsForCommits (commits: CommitDetails[]): Promise<CommitWithMetrics[]> {
        const [oldest, ...oldestToLatest] = commits.reverse();

        const commitsWithDiffMetrics = await Promise.all(oldestToLatest.map((commit, index) => {
            const previousCommitHash = index === 0 ? oldest.hash : oldestToLatest[index - 1].hash;
            return this.calculateSingleCommitDiffMetrics(commit, previousCommitHash)
        }));
        const oldestCommitWithMetric = await this.calculateMetricsUsingSnapshot(oldest);

        return this.buildAllMetricsFromCommitsWithDiffs(oldestCommitWithMetric, commitsWithDiffMetrics);
    }

    private async calculateMetricsUsingSnapshot(commit: CommitDetails): Promise<CommitWithMetrics> {
        return await new FullSnapshotStrategy(this.options).calculateMetricsForSingleCommit(commit);
    }

    private getSingleCommitExtensionsDiffFromPreviousCommit(commit: CommitDetails) {
        const METRIC_INCREASING_STATUSES = ['A', 'C', 'R']; //an additional file was added
        const METRIC_DECREASING_STATUSES = ['D']; //a file was deleted

        const differencePerFile = { increase: [] as string[], decrease: [] as string[] };
        commit.status.forEach((fileStatus, index) => {
            if (METRIC_INCREASING_STATUSES.some(statusChar => fileStatus?.startsWith(statusChar))) {
                differencePerFile.increase.push(commit.files[index]);
            }
            if (METRIC_DECREASING_STATUSES.some(statusChar => fileStatus?.startsWith(statusChar))) {
                differencePerFile.decrease.push(commit.files[index]);
            }
        });

        const countFileMetricsDiffs = (globs: string[]) => {
            const regexes = globs.map(glob => globToRegExp(glob));
            const countMatchingFiles = (fileNames: string[]) => {
                return fileNames.filter(file => regexes.some(regex => regex.test(file))).length;
            };
            return countMatchingFiles(differencePerFile.increase) - countMatchingFiles(differencePerFile.decrease);
        };

        return mapValues(this.options.trackByFileExtension.metricNameToGlobs, (metricGlobs) => countFileMetricsDiffs(metricGlobs))
    }

    async isFileInCommitContainsPhraseImpl(filepath: string, commitHash: string, phrase: string): Promise<boolean> {
        //TODO: it's possible that on renames or deletions the provess will fail - if so wrap in try / catch and retun false
        // const { blob } = await git.readBlob({ fs: fse, oid: commitHash, filepath, dir: this.options.repositoryPath });
        // return Buffer.from(blob).includes(phrase);

        return isFileInCommitContainsPhrase({repositoryPath: this.options.copiedRepositoryPath, commitHash, filepath, phrase});
    }

    private async getSingleCommitContentDiffFromPreviousCommit(commit: CommitDetails, previousCommitHash: string) {
        //TODO: rename...
        const filesWithStatuses = commit.files.map((filepath, index) => ({ filepath, status: commit.status[index] }))
        const getSingleMetricDiff = async ({globs, phrase}: TrackFileContenOptions[string]): Promise<number> => {
            const relevantFileNamesRegex = globs.map(glob => globToRegExp(glob));

            const relevantFiles = filesWithStatuses.filter(({ filepath }) => relevantFileNamesRegex.some(regex => regex.test(filepath)));
            const changesPerFile = await Promise.all(relevantFiles.map(async ({filepath, status}) => {
                const existedOnPreviousCommit = status !== 'A';
                const existsOnCurrentCommit = status !== 'D';
                try {
                const [isContainingInCurrentCommit, isContainingInPreviousCommit] = await Promise.all([
                    existsOnCurrentCommit ? this.isFileInCommitContainsPhrase(filepath, commit.hash, phrase) : false,
                    existedOnPreviousCommit ? this.isFileInCommitContainsPhrase(filepath, previousCommitHash, phrase) : false,
                ]);
                if (isContainingInCurrentCommit === isContainingInPreviousCommit) {
                    return 0;
                }
                return isContainingInCurrentCommit && !isContainingInPreviousCommit ? 1 : -1;
            } catch(err) {
                //TODO: remove this try / catch
                    console.error('error for status: ' , status, err);
                     return 0
                }
            }));
            return _.sum(changesPerFile);
        };

        const metricsDiffs: CommitMetrics = {};
        const metricsCalculationPromises = _.map(this.options.trackByFileContent, async (metricOptions, metricName) => {
            const metricDiff = await getSingleMetricDiff(metricOptions);
            metricsDiffs[metricName] = metricDiff;
        });
        await Promise.all(metricsCalculationPromises);

        return metricsDiffs;
    }

    private async calculateSingleCommitDiffMetrics(commit: CommitDetails, previousCommitHash: string): Promise<CommitWithDiffMetrics> {
        const extensionsDiffFromPreviousCommit = this.getSingleCommitExtensionsDiffFromPreviousCommit(commit);
        const contentDiffFromPreviousCommit = await this.getSingleCommitContentDiffFromPreviousCommit(commit, previousCommitHash);

        return {
            commit,
            extensionsDiffFromPreviousCommit,
            contentDiffFromPreviousCommit
        }
    }

    private buildAllMetricsFromCommitsWithDiffs(oldestCommit: CommitWithMetrics, diffCommitsFromOldestToLatest: CommitWithDiffMetrics[]): CommitWithMetrics[] {
        const oldestToLatest = [oldestCommit];
        diffCommitsFromOldestToLatest.forEach((commitWithDiffMetrics, index) => {
            const previousCommitMetrics = oldestToLatest[index].metrics;
            const currentCommitMetrics = this.combineExtensionsDiffMetrics(previousCommitMetrics, commitWithDiffMetrics);
            oldestToLatest.push({ commit: commitWithDiffMetrics.commit, metrics: currentCommitMetrics });
        });
        return oldestToLatest.reverse();
    }

    private combineExtensionsDiffMetrics(previousMetrics: CommitMetrics, commitWithDiff: CommitWithDiffMetrics) {
        const allDiffMetrics = { ...commitWithDiff.contentDiffFromPreviousCommit, ...commitWithDiff.extensionsDiffFromPreviousCommit };
        return mapValues(previousMetrics, (value, key) => value + (allDiffMetrics[key] || 0));
    }
}