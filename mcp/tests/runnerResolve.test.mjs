import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { handlePublishVideo } from '../dist/tools/publish.js';
import { handleListAccounts } from '../dist/tools/accounts.js';
import { createCliFixture, withEnv, removeCliFixture } from './fixtures.mjs';
import { runCli, resolveMatrixmediaCommand, defaultInstallLocations } from '../dist/runner.js';
import { existsSync } from 'node:fs';

test('MATRIXMEDIA_BIN is used and publish_video forwards --phone for xhs', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mm-bin-'));
  const argsLog = path.join(dir, 'args.json');
  const { bin, env } = await createCliFixture(
    dir,
    `#!/usr/bin/env node
require('fs').writeFileSync(${JSON.stringify(argsLog)}, JSON.stringify(process.argv.slice(2)));
console.log(JSON.stringify({ resultStatus: 'success', message: 'ok' }));
`
  );
  try {
    await withEnv({ ...env, MATRIXMEDIA_BIN: bin }, async () => {
      const out = JSON.parse(
        await handlePublishVideo({
          platform: 'xhs',
          phone: '13800138000',
          file: '/tmp/v.mp4',
          title: 't',
        })
      );
      assert.equal(out.status, 'success');
      const argv = JSON.parse(await readFile(argsLog, 'utf8'));
      assert.deepEqual(argv.slice(0, 4), ['cli', 'publish', '-p', 'xhs']);
      const i = argv.indexOf('--phone');
      assert.ok(i > 0 && argv[i + 1] === '13800138000');
      assert.ok(!argv.includes('--partition'));
    });
  } finally {
    await removeCliFixture(dir);
  }
});

test('publish_video rejects unknown platform', async () => {
  await assert.rejects(
    handlePublishVideo({ platform: 'weibo', phone: '1', file: '/tmp/v.mp4', title: 't' }),
    /platform must be one of/
  );
});

const appInstalledHere = defaultInstallLocations().some(p => existsSync(p));

test('missing app yields an actionable install hint', { skip: appInstalledHere && process.platform !== 'win32' && 'MatrixMedia installed at a default location on this machine' }, async () => {
  const empty = await mkdtemp(path.join(tmpdir(), 'mm-empty-'));
  try {
    await withEnv(
      { MATRIXMEDIA_BIN: undefined, MATRIXMEDIA_DIR: empty, PATH: empty, HOME: empty,
        LOCALAPPDATA: empty, ProgramFiles: empty, 'ProgramFiles(x86)': empty },
      async () => {
        await assert.rejects(handleListAccounts({}), /未找到 MatrixMedia/);
      }
    );
  } finally {
    await removeCliFixture(empty);
  }
});

// A leaked Electron Node-mode flag must never reach the application executable.
test('explicit executable receives intact arguments and no inherited Electron Node flag', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mm runner spaces '));
  const { bin, env } = await createCliFixture(dir, `
console.log(JSON.stringify({ args: process.argv.slice(2), nodeMode: Object.hasOwn(process.env, 'ELECTRON_RUN_AS_NODE') }));
process.exit(3);
`);
  try {
    await withEnv({ ...env, MATRIXMEDIA_BIN: bin, ELECTRON_RUN_AS_NODE: '1' }, async () => {
      const result = await runCli(['accounts', '--title', 'space & literal value']);
      assert.equal(result.exitCode, 3);
      assert.deepEqual(result.lastJson, { args: ['cli', 'accounts', '--title', 'space & literal value'], nodeMode: false });
      assert.equal(process.env.ELECTRON_RUN_AS_NODE, '1', 'caller environment is preserved');
    });
  } finally {
    await removeCliFixture(dir);
  }
});

test('dev checkout uses the Electron executable and clears inherited Node mode', { skip: appInstalledHere && process.platform !== 'win32' && 'Default installation takes precedence over dev checkout' }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mm dev spaces '));
  const electronDir = path.join(dir, 'node_modules', 'electron');
  const dist = path.join(electronDir, 'dist');
  await mkdir(dist, { recursive: true });
  const { bin, env } = await createCliFixture(dist, `
console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), nodeMode: Object.hasOwn(process.env, 'ELECTRON_RUN_AS_NODE') }));
process.exit(4);
`, 'electron');
  await writeFile(path.join(electronDir, 'path.txt'), path.basename(bin));
  try {
    await withEnv({ ...env, MATRIXMEDIA_BIN: undefined, MATRIXMEDIA_DIR: dir, PATH: '', ELECTRON_RUN_AS_NODE: '1',
      LOCALAPPDATA: dir, ProgramFiles: dir, 'ProgramFiles(x86)': dir }, async () => {
      const resolved = resolveMatrixmediaCommand();
      assert.equal(resolved?.command, bin);
      const result = await runCli(['history', '--json']);
      assert.equal(result.exitCode, 4);
      assert.deepEqual(result.lastJson, { args: ['.', 'cli', 'history', '--json'], cwd: dir, nodeMode: false });
    });
  } finally {
    await removeCliFixture(dir);
  }
});

test('PATH installation takes precedence over a dev checkout and clears Node mode', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mm path spaces '));
  const { env } = await createCliFixture(dir, `
console.log(JSON.stringify({ args: process.argv.slice(2), nodeMode: Object.hasOwn(process.env, 'ELECTRON_RUN_AS_NODE') }));
`);
  try {
    await withEnv({ ...env, MATRIXMEDIA_BIN: undefined, MATRIXMEDIA_DIR: dir,
      PATH: `${dir}${path.delimiter}${process.env.PATH || ''}`, ELECTRON_RUN_AS_NODE: '1' }, async () => {
      const result = await runCli(['history', '--json']);
      assert.equal(result.exitCode, 0);
      assert.deepEqual(result.lastJson, { args: ['cli', 'history', '--json'], nodeMode: false });
    });
  } finally {
    await removeCliFixture(dir);
  }
});
