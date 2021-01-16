import child_process from 'child_process';

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