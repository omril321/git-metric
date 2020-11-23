import os from 'os';
import fse from 'fs-extra';
import path from 'path';
import gitlog from "gitlog";
import * as child_process from 'child_process';

const REPO_NAME = 'repo_with_history';
const analyzedRepoPath = '/Users/omri/private/repos/repo_with_history/';
const copiedProjPath = path.resolve(os.tmpdir(), REPO_NAME, 'root');
const CLEAN_BEFORE_CLONE = true;


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
        if(CLEAN_BEFORE_CLONE) {
            fse.removeSync(commitData.cloneDestination);
        }
        child_process.execSync(`git checkout ${commitData.hash}`, { cwd: copiedProjPath });
        child_process.execSync(`git checkout-index -a --prefix=${commitData.cloneDestination}/`, { cwd: copiedProjPath });
    });

    return withCloneDetails;
}

async function run() {
    await copyProjectToTempDir();
    const commitHashes = getCommitHashes();
    const commitsWithCloneDetails = await cloneCommitsToFolders(commitHashes);


    console.log(commitsWithCloneDetails);
}

run();