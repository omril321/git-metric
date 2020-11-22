import os from 'os';
import fse from 'fs-extra';
import path from 'path';
import gitlog from "gitlog";

const analyzedRepoPath = '/Users/omri/private/repos/repo_with_history/';
const copiedProjPath = path.resolve(os.tmpdir(), 'repo_with_history/');


async function copyProjectToTempDir() {
    console.log(`copying project from ${analyzedRepoPath} to ${copiedProjPath}...`);
    await fse.copy(analyzedRepoPath, copiedProjPath, {errorOnExist: true, recursive: true});
    console.log(`successfully copied from ${analyzedRepoPath} to ${copiedProjPath}`);
}

async function getCommitHashes() {
    return gitlog({
        repo: analyzedRepoPath,
        before: '22-10-2020',
        until:  '01-11-2021', //TODO: dynamic range
        number: 50, //TODO: dynamic limit
        fields: ["hash", "subject", "authorName", "authorDate", "authorEmail"],
    });
}

async function run() {
    await copyProjectToTempDir();
    const commitHashes = getCommitHashes();
    console.log(commitHashes);
}

run();