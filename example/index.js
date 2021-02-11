const gitMetric = require('../dist/index.js');
const path = require('path');
const fs = require('fs');
const handler = require('serve-handler');
const http = require('http');
const clone = require('git-clone');

const repoCloneUrl = 'https://github.com/microsoft/TypeScriptSamples.git';
const repoName = 'TypeScriptSamples';

const config = {
    repositoryPath: path.resolve('.', repoName),
    trackByFileExtension: {
        'JS File Count': ['**.js', '**.jsx'],
        'TS File Count': ['**.ts', '**.tsx'],
    },
    trackByFileContent: {
        'React Related': {
            globs: ['**.js', '**.jsx', '**.ts', '**.tsx'],
            phrase: 'react'
        },
        'Angular Related': {
            globs: ['**.js', '**.jsx', '**.ts', '**.tsx'],
            phrase: 'angular'
        },
    },
    commitsSince: '1-15-2010', //MM-DD-YYYY
    commitsUntil: '11-18-2021', //MM-DD-YYYY
    maxCommitsCount: 450,
};


cloneRepo().then(() =>
    gitMetric.run(config).then((data) => {
        fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
        startServer();
    }));


function cloneRepo() {
    return new Promise(res => {
        console.log(`cloning repo ${repoCloneUrl}...`);
        clone(repoCloneUrl, path.resolve('.', repoName), () => {
            console.log(`done cloning repo ${repoCloneUrl}`);
            res();
        });
    });
};

function startServer() {
    const server = http.createServer(handler);

      server.listen(3000, () => {
        console.log('View result at http://localhost:3000');
      });
}