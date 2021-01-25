import * as child_process from 'child_process';
import { CommitDetails } from '.';

export function processAsPromise(process: child_process.ChildProcessWithoutNullStreams): Promise<unknown> {
    return new Promise(function (resolve, reject) {
        process.on('close', resolve);
        process.on('exit', resolve);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rejectError = (msg: any) => {
            reject(new Error(msg.toString()));
        }

        process.on('error', rejectError);

        process.stderr.on('data', rejectError);
      });
}

export function getNonModifiedFiles(commit: CommitDetails): string[] {
    return commit.files.filter((_, index) => commit.status[index] !== 'M');
}

export function buildFilesStringFromGlobs(globs: string[]): string | undefined {
    return globs.map(glob => `'${glob}'`).join(' ');
}
