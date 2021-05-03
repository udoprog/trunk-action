import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as httpm from '@actions/http-client';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as exec from '@actions/exec';
import stringArgv from "string-argv";

const USER_AGENT = 'udoprog/trunk-action';

const IS_WINDOWS = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

async function findVersion(repo: string, key: string): Promise<string> {
    const version = core.getInput(key);

    if (version !== 'latest') {
        return version;
    }

    core.info(`Searching the latest version of ${repo} ...`);

    const http = new httpm.HttpClient(USER_AGENT, [], {
        allowRetries: false
    });

    const response = await http.get(`https://api.github.com/repos/${repo}/releases/latest`);
    const body = await response.readBody();
    return Promise.resolve(JSON.parse(body).tag_name);
}

/**
 * Download and return the path to an executable wasm-bindgen tool.
 *
 * @param tag The tag to download.
 */
async function downloadWasmBindgen(tag: string) {
    let platform;

    if (IS_WINDOWS) {
        platform = 'x86_64-pc-windows-msvc';
    } else if (IS_MAC) {
        platform = 'x86_64-apple-darwin';
    } else {
        platform = 'x86_64-unknown-linux-musl';
    }

    const name = `wasm-bindgen-${tag}-${platform}`;
    const url = `https://github.com/rustwasm/wasm-bindgen/releases/download/${tag}/${name}.tar.gz`;

    const tool = await tc.downloadTool(url);
    let toolPath = path.join(await tc.extractTar(tool), name);

    if (!IS_WINDOWS) {
        const exe = path.join(toolPath, 'wasm-bindgen');
        await fs.chmod(exe, 0o755);
    }

    return Promise.resolve(toolPath);
}

/**
 * Download and return the path to an executable trunk tool.
 *
 * @param tag The tag to download.
 */
async function downloadTrunk(tag: string): Promise<string> {
    let platform;
    let zip = false;

    if (IS_WINDOWS) {
        platform = 'x86_64-pc-windows-msvc.zip';
        zip = true;
    } else if (IS_MAC) {
        platform = 'x86_64-apple-darwin.tar.gz';
    } else {
        platform = 'x86_64-unknown-linux-gnu.tar.gz';
    }

    const name = `trunk-${platform}`;
    const url = `https://github.com/thedodd/trunk/releases/download/${tag}/${name}`;
    const tool = await tc.downloadTool(url);
    let toolPath;

    if (zip) {
        toolPath = await tc.extractZip(tool);
    } else {
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

/**
 * Expand the current PATH while adding `p` to it.
 *
 * @param p Path to add.
 * @returns The expanded PATH.
 */
function expandPath(p: string): string {
    if (!process.env.PATH) {
        return `${p}`;
    } else {
        if (IS_WINDOWS) {
            return `${process.env.PATH};${p}`;
        } else {
            return `${process.env.PATH}:${p}`;
        }
    }
}

async function innerMain() {
    const inputArgs = core.getInput('args');
    const args = stringArgv(inputArgs);

    const wasmBindgenTag = await findVersion('rustwasm/wasm-bindgen', 'wasm-bindgen-version');
    core.info(`Downloading 'wasm-bindgen' from tag '${wasmBindgenTag}'`);
    const wasmBindgenPath = await downloadWasmBindgen(wasmBindgenTag);
    core.info(`Downloaded to ${wasmBindgenPath}`);

    const trunkTag = await findVersion('thedodd/trunk', 'version');
    core.info(`Downloading 'trunk' from tag '${trunkTag}'`);
    const trunkPath = await downloadTrunk(trunkTag);
    core.info(`Downloaded to ${trunkPath}`);

    core.info(`Running: ${trunkPath} ${inputArgs}`);

    const expandedPath = await expandPath(wasmBindgenPath);

    let n = await exec.exec(
        trunkPath,
        args,
        {
            env: {'PATH': expandedPath}
        }
    );

    if (n !== 0) {
        throw `trunk: returned ${n}`;
    }
}

async function main() {
    try {
        await innerMain();
    } catch (error) {
        core.setFailed(error.message);
    }
}

main();
