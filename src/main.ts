import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as httpm from '@actions/http-client';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as exec from '@actions/exec';
import stringArgv from "string-argv";

const DEFAULT_REPO: string = 'trunk-rs/trunk';
const GITHUB_URL: string = 'https://github.com';
const GITHUB_API_URL: string = 'https://api.github.com/repos';

// NB: https://github.com/trunk-rs/trunk/issues/632
const GZIP_OVERRIDES: { [key: string]: boolean } = {
    'v0.18.0': true,
};

const USER_AGENT = 'udoprog/trunk-action';
const IS_WINDOWS = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

/**
 * Find the version to download. If the version is "latest", this will query the
 * releases URL for the latest version.
 * 
 * @param repo The repository to query for releases, like "trunk-rs/trunk".
 * @param version The version to find. If "latest", the latest release will be returned.
 * @returns The resolved version string.
 */
async function findVersion(repo: string, version: string): Promise<string> {
    if (version !== 'latest') {
        return version;
    }

    const http = new httpm.HttpClient(USER_AGENT, [], {
        allowRetries: false
    });

    const url = `${GITHUB_API_URL}/${repo}/releases/latest`;

    core.info(`Fetching ${url}`);

    const response = await http.get(url);
    const body = await response.readBody();
    return Promise.resolve(JSON.parse(body).tag_name);
}

/**
 * Download and return the path to an executable trunk tool.
 *
 * @param repo The repository to download from.
 * @param tag The tag to download.
 */
async function downloadRelease(repo: string, tag: string): Promise<string> {
    let platform;
    let zip = false;

    if (IS_WINDOWS) {
        platform = 'x86_64-pc-windows-msvc.zip';
        zip = !GZIP_OVERRIDES[tag];
    } else if (IS_MAC) {
        platform = 'x86_64-apple-darwin.tar.gz';
    } else {
        platform = 'x86_64-unknown-linux-gnu.tar.gz';
    }

    const name = `trunk-${platform}`;
    const url = `${GITHUB_URL}/${repo}/releases/download/${tag}/${name}`;

    core.info(`Downloading ${url}`);

    const tool = await tc.downloadTool(url);
    let toolPath;

    if (zip) {
        toolPath = await tc.extractZip(tool);
    } else {
        if (GZIP_OVERRIDES[tag]) {
            core.warning(`Overriding gzip extraction for ${tag}`);
        }

        toolPath = await tc.extractTar(tool);
    }

    let exe;

    if (!IS_WINDOWS) {
        exe = path.join(toolPath, 'trunk');
        await fs.chmod(exe, 0o755);
    } else {
        exe = path.join(toolPath, 'trunk.exe');
    }

    return Promise.resolve(exe);
}

function orDefault(value: string, defaultValue: string): string {
    if (value === '') {
        return defaultValue;
    }

    return value;
}

async function innerMain() {
    const repo = orDefault(core.getInput('repo'), DEFAULT_REPO);
    const args = stringArgv(core.getInput('args'));
    const version = orDefault(core.getInput('version'), 'latest');

    core.info(`Using repository ${repo}`);

    const tag = await findVersion(repo, version);
    core.info(`Downloading 'trunk' from tag '${tag}'`);

    const path = await downloadRelease(repo, tag);
    core.info(`Downloaded to ${path}`);

    core.info(`${path} ${args.join(' ')}`);
    let n = await exec.exec(path, args);

    if (n !== 0) {
        throw `trunk: returned ${n}`;
    }
}

async function main() {
    try {
        await innerMain();
    } catch (error) {
        // @ts-ignore
        core.setFailed(error.message);
    }
}

main();
