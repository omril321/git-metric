import { run } from '../../src';
import { GitRepoForTests } from './utils';

describe('e2e', () => {

    (['differential', 'full-snapshot'] as const).forEach(strategy => {
        it(`should count files metrics properly for a repo with a single commit using strategy ${strategy}`, async () => {
            const repo = new GitRepoForTests()
            await repo.init();

            await repo.executeCommits(
                [
                    { create: ['file1.ts'] }
                ]
            )
            const result = await run({
                metricNameToGlob: { tsFilesForThisTest: ['**.ts'], txtFiles: ['**.txt'] },
                repositoryPath: repo.path!,
                strategy,
                task: 'count-files',
                ignoreModifiedFiles: true,
                maxCommitsCount: 10,
                commitsSince: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), //yesterday
            })

            expect(result).toHaveLength(1);
            expect(result[0].metrics).toEqual({ tsFilesForThisTest: 1, txtFiles: 0 });
        });
    })

});