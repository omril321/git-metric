import _ from 'lodash';
import { run } from '../../src';
import { GitRepoForTests } from './utils';

describe('e2e', () => {
    describe('file extension metric only', () => {
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

            expect(resultMetrics).toEqual([ //first here is latest commit
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

            expect(resultMetrics).toEqual([ //first here is latest commit
                { tsFilesForThisTest: 1, txtFiles: 1, noSuchExtension: 0 },
                { tsFilesForThisTest: 2, txtFiles: 2, noSuchExtension: 0 },
                { tsFilesForThisTest: 4, txtFiles: 2, noSuchExtension: 0 },
            ]);
        });

        it('should count file extension metrics properly for a repository with folders hierarchy with a single commit', async () => {
            const repo = new GitRepoForTests()
            await repo.init();

            await repo.executeCommits([{ create: ['f1/file1.ts', 'f2/file2.ts', 'f2/file3.ts', 't/t.ts', 't/txt.txt'] }]);

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

            expect(resultMetrics).toEqual([ //first here is latest commit
                { tsFilesForThisTest: 4, txtFiles: 1, noSuchExtension: 0 },
            ]);
        })
    });

    describe('file content metric only', () => {
        it('should count file content metrics for a repository with folders hierarchy when some files matching and some not', async () => {
            const repo = new GitRepoForTests()
            await repo.init();

            await repo.executeCommits([
                { create: ['f1/file1.ts', 'f2/file2.ts', 'f2/file3.tsx', 't/t.ts', 't/inner/txt1.txt', 't/txt2.txt'] },
                {
                    setContent: [
                        { file: 'f1/file1.ts',  content: 'aaa' }, // match tsWithAaa
                        { file: 'f2/file2.ts',  content: 'zzz' },
                        { file: 'f2/file3.tsx', content: 'aaa' },
                        { file: 't/t.ts',      content: 'aaa' }, // match tsWithAaa
                        { file: 't/inner/txt1.txt',  content: 'zzz' }, // match txtWithZzz
                        { file: 't/txt2.txt',  content: 'nope' }
                    ]
                }
            ]);

            const result = await run({
                trackByFileContent: {
                    tsWithAaa: {
                        globs: ['**.ts'],
                        phrase: 'aaa',
                    },
                    txtWithZzz: {
                        globs: ['**.txt'],
                        phrase: 'zzz',
                    },
                    noSuchFiles: {globs: ['nothingHere'], phrase: ''},
                },
                repositoryPath: repo.path!,
                maxCommitsCount: 10,
                commitsSince: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), //yesterday
            });
            const resultMetrics = _.map(result, 'metrics');

            expect(resultMetrics).toEqual([ //first here is latest commit
                { tsWithAaa: 2, txtWithZzz: 1, noSuchFiles: 0 },
                { tsWithAaa: 0, txtWithZzz: 0, noSuchFiles: 0 },
            ]);
        });


        it('should count file content metrics for a repository with multiple commits with folders hierarchy when some files matching and some not', async () => {
            const repo = new GitRepoForTests()
            await repo.init();

            await repo.executeCommits([
                { create: ['file1.ts', 'file2.txt'] },
                {
                    setContent: [
                        { file: 'file1.ts', content: 'aaa' },
                        { file: 'file2.txt', content: 'aaa' },
                    ]
                },
                { rename: [{ from: 'file1.ts', to: 'file1.txt' }] },
                { create: ['file3.ts'], },
                { setContent: [{ file: 'file3.ts', content: 'aaa' }] },
                { remove: ['file3.ts'] }
            ]);

            const result = await run({
                trackByFileContent: {
                    tsWithAaa: {
                        globs: ['**.ts'],
                        phrase: 'aaa',
                    },
                },
                repositoryPath: repo.path!,
                maxCommitsCount: 10,
                commitsSince: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), //yesterday
            });
            const resultMetrics = _.map(result, 'metrics');

            expect(resultMetrics).toEqual([ //first here is latest commit
                { tsWithAaa: 0, },
                { tsWithAaa: 1, },
                { tsWithAaa: 0, },
                { tsWithAaa: 0, },
                { tsWithAaa: 1, },
                { tsWithAaa: 0, },
            ]);
        });

    })
    //TODO: mix of metrics
});
