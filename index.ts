import os from 'os';
import fse from 'fs-extra';
import path from 'path';
import gitlog from "gitlog";
import * as child_process from 'child_process';
import glob from 'glob';

const REPO_NAME = 'testimio';
const analyzedRepoPath = path.resolve(__dirname, 'testimio');
const copiedProjPath = path.resolve(os.tmpdir(), REPO_NAME, 'root');
const tmpArchivesDirPath = path.resolve(os.tmpdir(), REPO_NAME, 'archives');
const CLEAN_BEFORE_CLONE = true;

//OPTIONS //TODO: make this configurable
const HISTORY_MAX_LENGTH = 50;
const COMMITS_BEFORE = '22-10-2020';
const COMMITS_UNTIL = '01-11-2021';
const ARCHIVE_TOOL: 'tar' | 'zip' = 'zip'; //zip is quicker

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
    const isEmpty = fse.readdirSync(clone.cloneDestination).length === 0;
    if (isEmpty) {
        throw new Error('attempt to collect metrics for an empty directory - this probably means that the archive process malfunctioned');
    }
    const jsFilesCount = glob.sync('apps/clickim/**/*.{js,jsx}', {cwd: clone.cloneDestination}).length;
    const tsFilesCount = glob.sync('apps/clickim/**/*.{ts,tsx}', {cwd: clone.cloneDestination}).length;
    const metrics = {
        jsFilesCount,
        tsFilesCount,
    }
    return {commit: clone, metrics };
}

async function createCommitSnapshotUsingTar(commitHash: string, cloneDestination: string) {
    try {
        await emptyDirIfAllowed(cloneDestination);
        const tmpTarPath = path.resolve(tmpArchivesDirPath, `${commitHash}.tar`);
        await processAsPromise(child_process.spawn('git', ['archive', '--format=tar', '-o', tmpTarPath, commitHash], { cwd: copiedProjPath }));

        await emptyDirIfAllowed(cloneDestination);
        await processAsPromise(child_process.spawn('tar', ['-zxf', tmpTarPath, '-C', cloneDestination], { cwd: tmpArchivesDirPath }));
    } catch (err) {
        throw err.toString();
    };
}

async function createCommitSnapshotUsingZip(commitHash: string, cloneDestination: string) {
    try {
        await emptyDirIfAllowed(cloneDestination);
        const tmpZipPath = path.resolve(tmpArchivesDirPath, `${commitHash}.zip`);
        await processAsPromise(child_process.spawn('git', ['archive', '--format=zip', '-0', '-o', tmpZipPath, commitHash], { cwd: copiedProjPath }));

        await emptyDirIfAllowed(cloneDestination);
        await processAsPromise(child_process.spawn('unzip', ['-q', '-d', cloneDestination, tmpZipPath], { cwd: tmpArchivesDirPath }));
    } catch (err) {
        throw err.toString();
    };
}

async function createCommitSnapshotAtDestination(commit: ReturnType<typeof getCommitHashes>[0]) {
    const withCloneDetails = { ...commit, cloneDestination: path.resolve(os.tmpdir(), REPO_NAME, commit.hash) };
    if (ARCHIVE_TOOL === 'tar') {
        await createCommitSnapshotUsingTar(withCloneDetails.hash, withCloneDetails.cloneDestination);
    }
    if (ARCHIVE_TOOL === 'zip') {
        await createCommitSnapshotUsingZip(withCloneDetails.hash, withCloneDetails.cloneDestination);
    }
    return withCloneDetails;
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
        await emptyDirIfAllowed(tmpArchivesDirPath);
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