import * as child_process from 'child_process';

export function processAsPromise(process: child_process.ChildProcessWithoutNullStreams) {
    return new Promise(function (resolve, reject) {
        process.on('close', resolve);
        process.on('exit', resolve);
        process.stdout.on('data', (data) => {
            console.log(`Received chunk ${data}`);
        });
        const rejectError = (msg: any) => {
            reject(new Error(msg.toString()));
        }

        process.on('error', rejectError);

        process.stderr.on('data', rejectError);
      });
}
