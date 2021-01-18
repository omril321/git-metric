import child_process from 'child_process';
import os from 'os';

export function isFileInCommitContainsPhrase({commitHash, filepath, phrase, repositoryPath}: { repositoryPath: string, commitHash: string, filepath: string, phrase: string, }): Promise<boolean> {
    return new Promise(resolve => {
        const catFile = child_process.spawn('git', ['cat-file', '-p', `${commitHash}:${filepath}`], { cwd: repositoryPath });
        const grep = child_process.spawn('grep', ['-q', phrase], { stdio: [catFile.stdout] });
        grep.on('exit', (code) => {
            const found = code === 0;
            resolve(found);
        });
    });
}

export async function listFilesInCommitWithPatterns({commitHash, fileRegexes, repositoryPath}: { repositoryPath: string, commitHash: string, fileRegexes: RegExp[], }): Promise<string[]> {
    return new Promise(resolve => {
        const filesInCommit = child_process.spawn('git', ['ls-tree', `${commitHash}`, '-r', '--name-only'], { cwd: repositoryPath });
        let outputContainer = '';
        filesInCommit.stdout?.on('data', (data: Buffer) => {
            outputContainer = outputContainer.concat(data.toString());
        })
        filesInCommit.on('exit', () => {
            const result = outputContainer.split(os.EOL)
                .filter(file => fileRegexes.some(regex => regex.test(file)));
            resolve(result);
        })
    });
}
