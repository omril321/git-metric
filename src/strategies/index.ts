import { CommitDetails, CommitWithMetrics } from '..';

export interface MeasurementStrategy {
    calculateMetricsForCommits: (commits: CommitDetails[]) => Promise<CommitWithMetrics[]>;
}