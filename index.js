const os = require('os');
const { execSync } =  require('child_process');
const fse = require('fs-extra');
const path = require('path');

const analyzedRepoPath = '/Users/omri/private/repos/repo_with_history/';

const copiedProjPath = path.resolve(os.tmpdir(), 'repo_with_history/');


async function copyProjectToTempDir() {
    console.log(`copying project from ${analyzedRepoPath} to ${copiedProjPath}...`);
    await fse.copy(analyzedRepoPath, copiedProjPath, {errorOnExist: true, recursive: true});
    console.log(`successfully copied from ${analyzedRepoPath} to ${copiedProjPath}`);
}

async function process() {
    await copyProjectToTempDir();
}

process();