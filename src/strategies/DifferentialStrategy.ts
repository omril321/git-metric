import { MeasurementStrategy } from '.';
import { CommitDetails, CommitMetrics, CommitWithMetrics } from '..';
import { FullSnapshotOptions, FullSnapshotStrategy } from './FullSnapshotStrategy';
import globToRegExp from 'glob-to-regexp'
import { mapValues } from 'lodash';

type DifferentialStrategyOptions = FullSnapshotOptions;

interface CommitWithDiffMetrics  {
    commit: CommitDetails;
    diffFromPreviousCommit: CommitMetrics;
}

export class DifferentialStrategy implements MeasurementStrategy {
    constructor(private options: DifferentialStrategyOptions) {
    }

    public async calculateMetricsForCommits (commits: CommitDetails[]): Promise<CommitWithMetrics[]> {
        const [oldest, ...oldestToLatest] = commits.reverse();

        const commitsWithDiffMetrics = oldestToLatest.map((commit) => this.calculateSingleCommitDiffMetrics(commit));
        const oldestCommitWithMetric = await this.calculateMetricsUsingSnapshot(oldest);

        return this.buildAllMetricsFromCommitsWithDiffs(oldestCommitWithMetric, commitsWithDiffMetrics);
    }

    private async calculateMetricsUsingSnapshot(commit: CommitDetails): Promise<CommitWithMetrics> {
        return await new FullSnapshotStrategy(this.options).calculateMetricsForSingleCommit(commit);
    }

    private calculateSingleCommitDiffMetrics(commit: CommitDetails): CommitWithDiffMetrics {
        const METRIC_INCREASING_STATUSES = ['A', 'C', 'R']; //an additional file was added
        const METRIC_DECREASING_STATUSES = ['D']; //a file was deleted

        const fileMetricsCount = { increase: [] as string[], decrease: [] as string[] };
        commit.status.forEach((fileStatus, index) => {
            if (METRIC_INCREASING_STATUSES.some(statusChar => fileStatus?.startsWith(statusChar))) {
                fileMetricsCount.increase.push(commit.files[index]);
            }
            if (METRIC_DECREASING_STATUSES.some(statusChar => fileStatus?.startsWith(statusChar))) {
                fileMetricsCount.decrease.push(commit.files[index]);
            }
        });

        const countFileMetricsDiffs = (globs: string[]) => {
            const regexes = globs.map(glob => globToRegExp(glob));
            const countMatchingFiles = (fileNames: string[]) => {
                return fileNames.filter(file => regexes.some(regex => regex.test(file))).length;
            };
            return countMatchingFiles(fileMetricsCount.increase) - countMatchingFiles(fileMetricsCount.decrease);
        };

        const diffFromPreviousCommit = mapValues(this.options.metricNameToGlob, (metricGlobs) => countFileMetricsDiffs(metricGlobs))

        return {
            commit,
            diffFromPreviousCommit
        }
    }

    private buildAllMetricsFromCommitsWithDiffs(oldestCommit: CommitWithMetrics, diffCommitsFromOldestToLatest: CommitWithDiffMetrics[]): CommitWithMetrics[] {
        const oldestToLatest = [oldestCommit];
        diffCommitsFromOldestToLatest.forEach((commitWithDiffMetrics, index) => {
            const previousCommitMetrics = oldestToLatest[index].metrics;
            const currentMetrics = this.combineDiffMetrics(previousCommitMetrics, commitWithDiffMetrics.diffFromPreviousCommit);
            oldestToLatest.push({commit: commitWithDiffMetrics.commit, metrics: currentMetrics})
        });
        return oldestToLatest.reverse();
    }

    private combineDiffMetrics(previousMetrics: CommitMetrics, diffMetrics: CommitMetrics) {
        return mapValues(previousMetrics, (value, key) => value + (diffMetrics[key] || 0));
    }
}