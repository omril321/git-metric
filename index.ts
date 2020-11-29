import os from 'os';
import fse from 'fs-extra';
import path from 'path';
import gitlog from "gitlog";
import * as child_process from 'child_process';
import glob from 'glob';

const REPO_NAME = 'testimio';
const analyzedRepoPath = '/tmp/testimio/';
const copiedProjPath = path.resolve(os.tmpdir(), REPO_NAME, 'root');
const CLEAN_BEFORE_CLONE = true;

const HISTORY_MAX_LENGTH = 200; //TODO: dynamic limit
const COMMITS_BEFORE = '22-10-2020'; //TODO: dynamic range
const COMMITS_UNTIL = '01-11-2021';

interface CLONED_COMMIT_DIR {
    cloneDestination: string;
    hash: string;
    subject: string;
    authorName: string;
    authorDate: string;
    authorEmail: string;
    status: string;
    files: string[];
}

interface COMMIT_WITH_METRICS {
    commit: CLONED_COMMIT_DIR,
    metrics: {[metricName: string]: number};
}

async function copyProjectToTempDir() {
    console.log(`copying project from ${analyzedRepoPath} to ${copiedProjPath}...`);
    await fse.copy(analyzedRepoPath, copiedProjPath, {errorOnExist: true, recursive: true});
    console.log(`successfully copied from ${analyzedRepoPath} to ${copiedProjPath}`);
}

function getCommitHashes() {
    return gitlog({
        repo: copiedProjPath,
        before: COMMITS_BEFORE,
        until:  COMMITS_UNTIL,
        number: HISTORY_MAX_LENGTH,
        fields: ["hash", "subject", "authorName", "authorDate", "authorEmail"],
    });
}

function cloneCommitsToFolders(commits: ReturnType<typeof getCommitHashes>) {
    const withCloneDetails = commits.map(commit => ({ ...commit, cloneDestination: path.resolve(os.tmpdir(), REPO_NAME, commit.hash) }));
    withCloneDetails.forEach((commitData) => {
        console.log(`=======================`)
        if(CLEAN_BEFORE_CLONE) {
            console.log(`removing ${commitData.cloneDestination} ... `)
            fse.removeSync(commitData.cloneDestination);
            console.log(`successfully removed ${commitData.cloneDestination} `)
        }
        console.log(`checking out ${commitData.hash} ... `);
        child_process.spawnSync('git', ['checkout', commitData.hash], { cwd: copiedProjPath + '/' });
        console.log(`export commit into ${commitData.cloneDestination} ... `);
        child_process.spawnSync('git', ['checkout-index', '-a', `--prefix=${commitData.cloneDestination}/`], { cwd: copiedProjPath });
        console.log(`succesffuly exported into ${commitData.cloneDestination}`);
    });

    return withCloneDetails;
}

function mapCloneToMetric(clone: CLONED_COMMIT_DIR): COMMIT_WITH_METRICS {
    const jsFilesCount = glob.sync('**/*.{js,jsx}', {cwd: clone.cloneDestination}).length;
    const tsFilesCount = glob.sync('**/*.{ts,tsx}', {cwd: clone.cloneDestination}).length;
    const metrics = {
        jsFilesCount,
        tsFilesCount,
    }
    return {commit: clone, metrics };
}

async function run() {
    await copyProjectToTempDir();
    const commitHashes = getCommitHashes();
    const commitsWithCloneDetails = await cloneCommitsToFolders(commitHashes);
    const withMetrics = await Promise.all(commitsWithCloneDetails.map(mapCloneToMetric))

    console.log(withMetrics.map((c) => ({hash: c.commit.hash, metrics: c.metrics})));
}

run();