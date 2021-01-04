import { CommitDetails, } from '..';

export type CommitMetrics = {[metricName: string]: number};

export interface CommitWithMetrics {
    commit: CommitDetails,
    metrics: CommitMetrics;
}

export interface MeasurementStrategy {
    calculateMetricsForCommits: (commits: CommitDetails[]) => Promise<CommitWithMetrics[]>;
}