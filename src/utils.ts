import * as child_process from 'child_process';
import { CommitDetails } from '.';
import _ from 'lodash';

export function processAsPromise(process: child_process.ChildProcessWithoutNullStreams): Promise<unknown> {
    return new Promise(function (resolve, reject) {
        process.on('close', resolve);
        process.on('exit', resolve);
        process.stdout.on('data', (data) => {
            console.log(`Received chunk ${data}`);
        });
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

export function buildFilesStringFromMetricsToGlobsMap(metricNameToGlob: { [metricName: string]: string[] }): string | undefined {
    const flattenedGlobsList = _.chain(metricNameToGlob).values().flatten().value();
    if (!flattenedGlobsList) {
        return undefined;
    }

    return flattenedGlobsList.map(glob => `'${glob}'`).join(' ');
}
