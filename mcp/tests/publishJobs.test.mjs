import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCliFixture, removeCliFixture } from './fixtures.mjs';
import { fileURLToPath } from 'node:url';

const serverEntry = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'dist', 'index.js');

/** Minimal MCP stdio client. */
function startServer(env) {
  const child = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const closed = new Promise(resolve => child.once('close', resolve));
  const pending = new Map();
  let buf = '';
  let nextId = 1;
  child.stdout.on('data', chunk => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  const send = msg => child.stdin.write(JSON.stringify(msg) + '\n');
  const request = (method, params) =>
    new Promise(resolve => {
      const id = nextId++;
      pending.set(id, resolve);
      send({ jsonrpc: '2.0', id, method, params });
    });
  const call = async (name, args) => {
    const res = await request('tools/call', { name, arguments: args });
    return { isError: Boolean(res.result.isError), body: res.result.content[0].text };
  };
  return {
    async init() {
      await request('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      });
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    },
    request,
    call,
    async close() {
      child.kill();
      await closed;
    },
  };
}

async function fakeBin(dir, { sleepMs, exitCode = 0, stdout }) {
  const counter = path.join(dir, 'count.txt');
  const { bin, env } = await createCliFixture(
    dir,
    `#!/usr/bin/env node
const fs = require('fs');
const c = ${JSON.stringify(counter)};
fs.writeFileSync(c, String((fs.existsSync(c) ? Number(fs.readFileSync(c, 'utf8')) : 0) + 1));
setTimeout(() => {
  ${stdout ? `console.log(${JSON.stringify(JSON.stringify(stdout))});` : ''}
  process.exit(${exitCode});
}, ${sleepMs});
`
  );
  return { bin, counter, env };
}

const videoArgs = { platform: 'dy', phone: '13800138000', file: '/tmp/v.mp4', title: 'jobs' };

test('slow publish returns a jobId, dedupes retries, and resolves via get_publish_status', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mm-jobs-'));
  const { bin, counter, env } = await fakeBin(dir, {
    sleepMs: 1500,
    stdout: { resultStatus: 'success', message: '上传成功' },
  });
  const srv = startServer({ ...env, MATRIXMEDIA_BIN: bin, MATRIXMEDIA_INLINE_WAIT_MS: '200' });
  try {
    await srv.init();

    const tools = await srv.request('tools/list', {});
    assert.ok(tools.result.tools.some(t => t.name === 'get_publish_status'));

    const first = JSON.parse((await srv.call('publish_video', videoArgs)).body);
    assert.equal(first.status, 'running');
    assert.ok(first.jobId);
    assert.equal(first.platform, 'dy');

    const retry = JSON.parse((await srv.call('publish_video', videoArgs)).body);
    assert.equal(retry.jobId, first.jobId);
    assert.equal(retry.reused, true);

    const done = JSON.parse(
      (await srv.call('get_publish_status', { jobId: first.jobId, waitSeconds: 10 })).body
    );
    assert.equal(done.status, 'success');
    assert.equal(done.message, '上传成功');
    assert.equal(await readFile(counter, 'utf8'), '1', 'CLI must run only once');
  } finally {
    await srv.close();
    await removeCliFixture(dir);
  }
});

test('fast publish failure is still reported inline as an error', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mm-jobs-'));
  const { bin, env } = await fakeBin(dir, {
    sleepMs: 10,
    exitCode: 3,
    stdout: { message: '账号未登录' },
  });
  const srv = startServer({ ...env, MATRIXMEDIA_BIN: bin, MATRIXMEDIA_INLINE_WAIT_MS: '5000' });
  try {
    await srv.init();
    const res = await srv.call('publish_video', videoArgs);
    assert.equal(res.isError, true);
    assert.match(res.body, /账号未登录/);
  } finally {
    await srv.close();
    await removeCliFixture(dir);
  }
});

test('background failure surfaces through get_publish_status', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mm-jobs-'));
  const { bin, env } = await fakeBin(dir, { sleepMs: 800, exitCode: 3, stdout: { message: '上传失败' } });
  const srv = startServer({ ...env, MATRIXMEDIA_BIN: bin, MATRIXMEDIA_INLINE_WAIT_MS: '100' });
  try {
    await srv.init();
    const started = JSON.parse((await srv.call('publish_video', videoArgs)).body);
    assert.equal(started.status, 'running');
    const st = JSON.parse(
      (await srv.call('get_publish_status', { jobId: started.jobId, waitSeconds: 10 })).body
    );
    assert.equal(st.status, 'failed');
    assert.match(st.error, /上传失败/);
  } finally {
    await srv.close();
    await removeCliFixture(dir);
  }
});

test('unknown jobId points the agent at list_history instead of republishing', async () => {
  const srv = startServer({});
  try {
    await srv.init();
    const res = await srv.call('get_publish_status', { jobId: 'nope' });
    assert.equal(res.isError, true);
    assert.match(res.body, /list_history/);
  } finally {
    await srv.close();
  }
});
