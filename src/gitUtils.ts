import child_process from 'child_process';
import os from 'os';

export function countFilesContainingPhraseInCommit({commitHash, filesGlobs, phrase, repositoryPath}: { repositoryPath: string, commitHash: string, filesGlobs: string[], phrase: string, }): Promise<number> {
    return new Promise(resolve => {
        const gitGrep = child_process.spawn('git', ['grep', '-r', '--files-with-matches', `${phrase}`, `${commitHash}`, ...filesGlobs], { cwd: repositoryPath });
        let output = '';
        gitGrep.stdout.on('data', (buff: Buffer) => {
            output = output.concat(buff.toString());
        });

        gitGrep.on('exit', () => {
            //each line is a file that matches
            resolve(output ? output.trim().split(os.EOL).length : 0);
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
