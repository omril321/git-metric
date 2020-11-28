import os from 'os';
import fse from 'fs-extra';
import path from 'path';
import gitlog from "gitlog";
import * as child_process from 'child_process';
import glob from 'glob';

const REPO_NAME = 'repo_with_history';
const analyzedRepoPath = '/Users/omri/private/repos/repo_with_history/';
const copiedProjPath = path.resolve(os.tmpdir(), REPO_NAME, 'root');
const CLEAN_BEFORE_CLONE = true;

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

async function copyProjectToTempDir() {
    console.log(`copying project from ${analyzedRepoPath} to ${copiedProjPath}...`);
    await fse.copy(analyzedRepoPath, copiedProjPath, {errorOnExist: true, recursive: true});
    console.log(`successfully copied from ${analyzedRepoPath} to ${copiedProjPath}`);
}

function getCommitHashes() {
    return gitlog({
        repo: copiedProjPath,
        before: '22-10-2020',
        until:  '01-11-2021', //TODO: dynamic range
        number: 50, //TODO: dynamic limit
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
        const result = child_process.spawnSync('git', ['checkout-index', '-a', `--prefix=${commitData.cloneDestination}/`], { cwd: copiedProjPath });
        console.log(`succesffuly exported into ${commitData.cloneDestination}`);
    });

    return withCloneDetails;
}

async function mapCloneToMetric(clone: CLONED_COMMIT_DIR) {
    async function getTsFileCount() {
        const res = glob.sync('**/*.txt', {cwd: clone.cloneDestination});
        console.log(res);
    }
    await getTsFileCount();

}

async function run() {
    await copyProjectToTempDir();
    const commitHashes = getCommitHashes();
    const commitsWithCloneDetails = await cloneCommitsToFolders(commitHashes);
    await Promise.all(commitsWithCloneDetails.map(mapCloneToMetric))

    console.log(commitsWithCloneDetails);
}

run();