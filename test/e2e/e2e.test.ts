import _ from 'lodash';
import { run } from '../../src';
import { GitRepoForTests } from './utils';

describe('e2e', () => {
    describe('extension metric only', () => {
        it(`should count file extension metrics properly for a repo with a single commit`, async () => {
            const repo = new GitRepoForTests()
            await repo.init();

            await repo.executeCommits(
                [
                    { create: ['file1.ts'] }
                ]
            )
            const result = await run({
                trackByFileExtension: { tsFilesForThisTest: ['**.ts'], txtFiles: ['**.txt'] },
                repositoryPath: repo.path!,
                maxCommitsCount: 10,
                commitsSince: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), //yesterday
            })

            expect(result).toHaveLength(1);
            expect(result[0].metrics).toEqual({ tsFilesForThisTest: 1, txtFiles: 0 });
        });

        it(`should count file extension metrics properly for a repo with multiple commits of renaming and modifying files`, async () => {
            const repo = new GitRepoForTests()
            await repo.init();

            await repo.executeCommits(
                [
                    {
                        create: ['file1.tsx', 'file2.ts', 'file3.ts', 'file4.txt', 'file5.txt', 'file6.ts']
                    },
                    {
                        modifyContent: ['file1.tsx'],
                        rename: [
                            { from: 'file2.ts', to: 'file2.something' },
                            { from: 'file3.ts', to: 'file3_renamed.ts' },
                        ],
                    },
                    {
                        modifyContent: ['file4.txt'],
                        rename: [
                            { from: 'file2.something', to: 'file2.ts', modifyContent: true },
                            { from: 'file3_renamed.ts', to: 'file3_renamed_again.ts' },
                            { from: 'file6.ts', to: 'file6.txt' },
                        ],
                    }
                ]
            )
            const result = await run({
                trackByFileExtension: {
                    tsFilesForThisTest: ['**.ts', '**.tsx'],
                    txtFiles: ['**.txt'],
                    noSuchExtension: ['unknown.bla']
                },
                repositoryPath: repo.path!,
                maxCommitsCount: 10,
                commitsSince: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), //yesterday
            });
            const resultMetrics = _.map(result, 'metrics');

            expect(resultMetrics).toEqual([ //first is latest
                { tsFilesForThisTest: 3, txtFiles: 3, noSuchExtension: 0 },
                { tsFilesForThisTest: 3, txtFiles: 2, noSuchExtension: 0 },
                { tsFilesForThisTest: 4, txtFiles: 2, noSuchExtension: 0 },
            ]);
        });

        it(`should count file extension metrics properly for a repo with multiple commits of creating, deleting and renaming files`, async () => {
            const repo = new GitRepoForTests()
            await repo.init();

            await repo.executeCommits(
                [
                    {
                        create: ['file1.ts', 'file2.ts', 'file3.tsx', 'file4.txt', 'file5.txt', 'file6.ts']
                    },
                    {
                        remove: ['file1.ts'],
                        rename: [
                            { from: 'file2.ts', to: 'file2.something', modifyContent: true },
                            { from: 'file3.tsx', to: 'file3_renamed.tsx' }
                        ],
                    },
                    {
                        remove: ['file2.something', 'file3_renamed.tsx', 'file4.txt'],
                    }
                ]
            );

            const result = await run({
                trackByFileExtension: {
                    tsFilesForThisTest: ['**.ts', '**.tsx'],
                    txtFiles: ['**.txt'],
                    noSuchExtension: ['unknown.bla'],
                },
                repositoryPath: repo.path!,
                maxCommitsCount: 10,
                commitsSince: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), //yesterday
            });
            const resultMetrics = _.map(result, 'metrics');

            expect(resultMetrics).toEqual([ //first is latest
                { tsFilesForThisTest: 1, txtFiles: 1, noSuchExtension: 0 },
                { tsFilesForThisTest: 2, txtFiles: 2, noSuchExtension: 0 },
                { tsFilesForThisTest: 4, txtFiles: 2, noSuchExtension: 0 },
            ]);
        });
    });

});
