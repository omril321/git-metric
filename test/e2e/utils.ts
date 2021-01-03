import os from 'os';
import path from 'path';
import git from 'isomorphic-git';
import fse from 'fs-extra';
import _ from 'lodash';


const TMP_REPOS_PATH = path.resolve(os.tmpdir(), 'project-metrics-e2e');

type CommitActions = {
    create: string[];
    remove: string[];
    modifyContent: string[];
    rename: { from: string, to: string, modifyContent?: boolean }[];
    message: string;
}

export class GitRepoForTests {
    public path?: string;
    private commitCount = 0;

    constructor() {
    }

    public async init() {
        this.path = path.resolve(TMP_REPOS_PATH, `${Date.now()}`);
        await git.init({fs: fse, dir: this.path});
        return this.path;
    }

    public async executeCommits(fileOperations: Partial<CommitActions>[]) {
        for (const ops of fileOperations) {
            await this.executeCommit(ops);
        }
    }

    private async executeCommit({ create = [], remove = [], rename = [], modifyContent = [], message = `Commit #${this.commitCount++} ${Date.now()}` }: Partial<CommitActions>) {
        if (!this.path) {
            throw new Error('Git repo is not initiated')
        }

        await Promise.all(create.map((relativePath) => this.createNewFile(relativePath)));
        await Promise.all(remove.map((relativePath) => this.deleteExistingFile(relativePath)));
        await Promise.all(rename.filter(({ modifyContent }) => modifyContent).map(({ from }) => this.modifyExistingFile(from)));
        await Promise.all(rename.map(({ from, to }) => this.renameExistingFile(from, to)));
        await Promise.all(modifyContent.map((relativePath) => this.modifyExistingFile(relativePath)));

        const filesToAdd = _.flatten([create, modifyContent, rename.map(({ to }) => to)])
        await Promise.all(filesToAdd.map((file) => git.add({ fs: fse, dir: this.path!, filepath: file })));

        const filesToRemove = _.flatten([remove, rename.map(({ from }) => from)]);
        await Promise.all(filesToRemove.map(file => git.remove({fs: fse, dir: this.path!, filepath: file})));

        await git.commit({ fs: fse, dir: this.path, message, author: { name: 'Fake test author' } });
    }

    private mapToRelativePath(relativePath: string) {
        return path.resolve(this.path!, relativePath);
    }


    private async createNewFile(relativePath: string) {
        const path = this.mapToRelativePath(relativePath);
        if (fse.existsSync(path)) {
            throw new Error(`Attempted creating a new file at path that already exists: ${path}`);
        }
        await fse.createFile(path);
        await fse.appendFile(path, `created at: ${Date.now} `);
    }

    private async deleteExistingFile(relativePath: string) {
        const path = this.mapToRelativePath(relativePath);
        if (!fse.existsSync(path)) {
            throw new Error(`Attempted deleting a file that doesn't exist: ${path}`);
        }
        await fse.remove(path);
    }

    private async renameExistingFile(relativePath: string, newRelativePath: string) {
        const path = this.mapToRelativePath(relativePath);
        const newPath = this.mapToRelativePath(newRelativePath);
        if (!fse.existsSync(path)) {
            throw new Error(`Attempted renaming a file that doesn't exist: ${path}`);
        }
        await fse.rename(path, newPath);
    }

    private async modifyExistingFile(relativePath: string) {
        const path = this.mapToRelativePath(relativePath);
        if (!fse.existsSync(path)) {
            throw new Error(`Attempted modifying a file that doesn't exist: ${path}`);
        }
        await fse.appendFile(path, `${Date.now} `);
    }
}
