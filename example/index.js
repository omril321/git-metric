const { default: run } = require('../dist/index.js');
const path = require('path');
const fs = require('fs');
const handler = require('serve-handler');
const http = require('http');

const config = {
    repositoryPath: path.resolve('./TypeScriptSamples'),
    trackByFileExtension: {
        jsFileCount: ['**.js', '**.jsx'],
        tsFileCount: ['**.ts', '**.tsx'],
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


run(config).then(( data ) => {
    fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
    startServer();
});

function startServer() {
    const server = http.createServer(handler);

      server.listen(3000, () => {
        console.log('View result at http://localhost:3000');
      });
}