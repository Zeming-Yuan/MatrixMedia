import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCliFixture, withEnv, removeCliFixture } from './fixtures.mjs';

import { handlePublishArticle } from '../dist/tools/publishArticle.js';

async function withFakeMatrixmedia(script, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'matrixmedia-mcp-test-'));
  const { bin, env } = await createCliFixture(dir, script);
  try {
    return await withEnv({ ...env, MATRIXMEDIA_BIN: bin }, fn);
  } finally {
    await removeCliFixture(dir);
  }
}

const baseArgs = {
  platform: 'juejin',
  phone: '13800138000',
  title: '测试标题',
  content: '测试正文',
};

test('publish_article rejects a zero-exit process that only emitted DevTools noise', async () => {
  await withFakeMatrixmedia(
    `#!/usr/bin/env node
process.stderr.write('\\nDevTools listening on ws://127.0.0.1:12345/devtools/browser/test\\n');
process.exit(0);
`,
    async () => {
      await assert.rejects(
        () => handlePublishArticle(baseArgs),
        /未返回发布结果/
      );
    }
  );
});

test('publish_article returns the puppeteerFile-done message and ignores DevTools noise', async () => {
  await withFakeMatrixmedia(
    `#!/usr/bin/env node
process.stderr.write('\\nDevTools listening on ws://127.0.0.1:12345/devtools/browser/test\\n');
process.stdout.write(JSON.stringify({ channel: 'puppeteerFile-done', status: true, message: '文章发布成功' }) + '\\n');
process.exit(0);
`,
    async () => {
      const result = JSON.parse(await handlePublishArticle(baseArgs));

      assert.deepEqual(result, {
        status: 'success',
        message: '文章发布成功',
      });
    }
  );
});
