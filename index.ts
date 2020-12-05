import os from 'os';
import fse from 'fs-extra';
import path from 'path';
import gitlog from "gitlog";
import * as child_process from 'child_process';
import glob from 'glob';

const REPO_NAME = 'testimio';
const analyzedRepoPath = path.resolve(__dirname, 'testimio');
const copiedProjPath = path.resolve(os.tmpdir(), REPO_NAME, 'root');
const tmpTarsDirPath = path.resolve(os.tmpdir(), REPO_NAME, 'archives');
const CLEAN_BEFORE_CLONE = true;

const HISTORY_MAX_LENGTH = 10; //TODO: dynamic limit
const COMMITS_BEFORE = '22-10-2020'; //TODO: dynamic range
const COMMITS_UNTIL = '01-11-2021';

process.on('unhandledRejection', error => {
    console.log('unhandledRejection', error && (error as any).message);
});


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

function processAsPromise(process: child_process.ChildProcessWithoutNullStreams) {
    return new Promise(function (resolve, reject) {
        process.on('close', resolve);
        process.on('exit', resolve);
        process.stdout.on('data', (data) => {
            console.log(`Received chunk ${data}`);
        });
        const rejectError = (msg: any) => {
            reject(new Error(msg.toString()));
        }

        process.on('error', rejectError);

        process.stderr.on('data', rejectError);
      });
}

async function emptyDirIfAllowed(path: string) {
    if (CLEAN_BEFORE_CLONE) {
        await fse.emptyDir(path);
    }
}


function mapCloneToMetric(clone: CLONED_COMMIT_DIR): COMMIT_WITH_METRICS {
    //TODO: this can be async?
    const jsFilesCount = glob.sync('apps/clickim/**/*.{js,jsx}', {cwd: clone.cloneDestination}).length;
    const tsFilesCount = glob.sync('apps/clickim/**/*.{ts,tsx}', {cwd: clone.cloneDestination}).length;
    const metrics = {
        jsFilesCount,
        tsFilesCount,
    }
    return {commit: clone, metrics };
}

async function createCommitSnapshotAtDestination(commit: ReturnType<typeof getCommitHashes>[0]) {
    const withCloneDetails = { ...commit, cloneDestination: path.resolve(os.tmpdir(), REPO_NAME, commit.hash) };
    await emptyDirIfAllowed(tmpTarsDirPath);
    try {
        await emptyDirIfAllowed(withCloneDetails.cloneDestination);
        const tmpTarPath = path.resolve(tmpTarsDirPath, `${withCloneDetails.hash}.tar`);

        const createArchiveProcess = child_process.spawn('git', ['archive', '--format=tar', '-o', tmpTarPath, withCloneDetails.hash], { cwd: copiedProjPath });
        await processAsPromise(createArchiveProcess);

        await emptyDirIfAllowed(withCloneDetails.cloneDestination);
        const unarchiveProcess = child_process.spawn('tar', ['-zxf', tmpTarPath, '-C', withCloneDetails.cloneDestination], { cwd: tmpTarsDirPath });
        await processAsPromise(unarchiveProcess);
        return withCloneDetails;
    } catch (err) {
        throw err.toString();
    };
}

async function handleSingleCommit(commit: ReturnType<typeof getCommitHashes>[0]) {
    const commitSnapshot = await createCommitSnapshotAtDestination(commit);
    const withMetrics = mapCloneToMetric(commitSnapshot);
    return withMetrics
}

async function run() {
    try {
        await copyProjectToTempDir();
        const commitHashes = getCommitHashes();
        const withMetrics = await Promise.all(commitHashes.map(handleSingleCommit));

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