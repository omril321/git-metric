import os from 'os';
import fse from 'fs-extra';
import path from 'path';
import gitlog from "gitlog";
import { FullSnapshotStrategy } from './strategies/fullSnapshot';
import { MeasurementStrategy } from './strategies';

const REPO_NAME = 'testimio';
const analyzedRepoPath = path.resolve(__dirname, '..', 'testimio');
const copiedProjectPath = path.resolve(os.tmpdir(), REPO_NAME, 'root');
const tmpArchivesDirPath = path.resolve(os.tmpdir(), REPO_NAME, 'archives');

//OPTIONS //TODO: make this configurable
export const CONFIG = {
    HISTORY_MAX_LENGTH: 50,
    COMMITS_BEFORE: '22-10-2020',
    COMMITS_UNTIL: '01-11-2021',

    //optimizations
    STRATEGY: 'full-snapshot', //'full-snapshot' | 'differential'
    FILE_FILTER: "'apps/clickim/**/*.js' 'apps/clickim/**/*.ts' 'apps/clickim/**/*.jsx' 'apps/clickim/**/*.tsx'", //optimization
    IGNORED_MODIFIED_ONLY: true,
}


//TODO: add optimizations, like extracting from git history only js / ts fies (set option for gitlog), and skipping commits without new / deleted files (look for modifiers in gitlog result[state])
//TODO: another optimization: delete uninteresting files before archiving and extracting the commit snapshot
process.on('unhandledRejection', error => {
    console.log('unhandledRejection', error && (error as any).message);
});

export interface CommitDetails {
    hash: string;
    subject: string;
    authorName: string;
    authorDate: string;
    authorEmail: string;
    status: string[];
    files: string[];
}

export interface CommitSnapshot extends CommitDetails {
    cloneDestination: string;
}

export interface CommitWithMetrics {
    commit: CommitSnapshot,
    metrics: {[metricName: string]: number};
}

async function copyProjectToTempDir() {
    console.log(`copying project from ${analyzedRepoPath} to ${copiedProjectPath}...`);
    await fse.copy(analyzedRepoPath, copiedProjectPath, {errorOnExist: true, recursive: true});
    console.log(`successfully copied from ${analyzedRepoPath} to ${copiedProjectPath}`);
}

function getCommitsDetails(): CommitDetails[] {
    const result = gitlog({
        repo: copiedProjectPath,
        before: CONFIG.COMMITS_BEFORE,
        until:  CONFIG.COMMITS_UNTIL,
        number: CONFIG.HISTORY_MAX_LENGTH,
        file: CONFIG.FILE_FILTER,
        fields: ["hash", "subject", "authorName", "authorDate", "authorEmail"],
    });
    return result as unknown as (Omit<typeof result[0], 'status'> & {status: string[]})[]; //this hack bypasses a typing bug in gitlog
}

function filterCommits(commits: CommitDetails[]): CommitDetails[] {
    if(CONFIG.IGNORED_MODIFIED_ONLY) {
        return commits.filter(commit => commit.status.some(status => status !== 'M'));
    }
    return commits;
}

function getSelectedStrategy(strategyName: string): MeasurementStrategy {
    switch(strategyName) {
        case 'full-snapshot': return new FullSnapshotStrategy({copiedProjectPath, repositoryName: REPO_NAME, tmpArchivesDirPath});
            default: throw new Error(`Unknown strategy: ${strategyName}`)
    }
}

async function run() {
    try {
        await copyProjectToTempDir();
        const commitsDetails = getCommitsDetails();
        const filteredCommits = filterCommits(commitsDetails);
        const strategy = getSelectedStrategy(CONFIG.STRATEGY);
        const withMetrics = await strategy.calculateMetricsForCommits(filteredCommits);

        console.log(withMetrics.map((c) => ({ hash: c.commit.hash, metrics: c.metrics })));
        return withMetrics;
    } catch (e) {
        console.error(e);
        throw e;
    }
}

const startTime = Date.now();
run().then(( metrics ) => {
    console.log('donnnneeeeee', metrics.map((e) => e.metrics));
    const endTiime = Date.now();
    console.log('total time: ', Math.round((endTiime - startTime) / 1000), 'seconds');
}).catch((err) => {
    console.error('oh no, error: ', err);
});