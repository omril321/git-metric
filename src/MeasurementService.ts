import { CommitDetails, ProcessedProgramOptions } from '.';
import { listFilesInCommitWithPatterns, countFilesContainingPhraseInCommit } from './gitUtils';
import globToRegex from 'glob-to-regexp';

export type CommitMetrics = {[metricName: string]: number};

export interface CommitWithMetrics {
    commit: CommitDetails,
    metrics: CommitMetrics;
}

export class MeasurementService {
    constructor(private options: ProcessedProgramOptions) {
    }

    public async calculateMetricsForCommits(commits: CommitDetails[]): Promise<CommitWithMetrics[]> {
        return await Promise.all(commits.map((commit) => this.addMetricsToCommitDetails(commit)));
    }

    private async getContentMetrics(commit: CommitDetails) {
        const metrics: CommitMetrics = {};
        await Promise.all(Object.keys(this.options.trackByFileContent)
            .map(async metricName => {
                const metricDetails = this.options.trackByFileContent[metricName];
                const matchingFileCount = await countFilesContainingPhraseInCommit({commitHash: commit.hash, filesGlobs: metricDetails.globs, phrase: metricDetails.phrase, repositoryPath: this.options.repositoryPath})
                metrics[metricName] = matchingFileCount;
            }));

        return metrics;
    }

    private async getExtensionsMetrics(commit: CommitDetails) {
        const metrics: CommitMetrics = {};
        await Promise.all(Object.keys(this.options.trackByFileExtension)
            .map(async metricName => {
                const metricFilesGlobs = this.options.trackByFileExtension[metricName];
                const globsAsRegex = metricFilesGlobs.map(glob => globToRegex(glob));
                const filesInCommitWithPattern = await listFilesInCommitWithPatterns({ commitHash: commit.hash, fileRegexes: globsAsRegex, repositoryPath: this.options.repositoryPath });
                metrics[metricName] = filesInCommitWithPattern.length;
            }));

        return metrics;
    }

    private async addMetricsToCommitDetails(clone: CommitDetails): Promise<CommitWithMetrics> {
        const [extensionsMetrics, contentMetrics] = await Promise.all([this.getExtensionsMetrics(clone), this.getContentMetrics(clone)])

        return { commit: clone, metrics: { ...extensionsMetrics, ...contentMetrics } };
    }
}
