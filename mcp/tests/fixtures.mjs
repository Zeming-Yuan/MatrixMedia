import { copyFile, link, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

// A real executable on every OS; only this copied Node process runs the fixture.
// The preload also reaches the MCP server, so guard it by the exact executable path.
export async function createCliFixture(dir, script, name = 'matrixmedia') {
  const bin = path.join(dir, name + (process.platform === 'win32' ? '.exe' : ''));
  const body = path.join(dir, `${name}.cjs`);
  const preload = path.join(dir, `${name}-preload.cjs`);
  if (process.platform === 'win32') {
    // Windows 会锁住运行中 node.exe 的硬链接，父测试进程退出前无法清理夹具。
    await copyFile(process.execPath, bin);
  } else {
    try {
      await link(process.execPath, bin);
    } catch {
      await copyFile(process.execPath, bin);
    }
  }
  await writeFile(body, script.replace(/^#![^\n]*\n/, ''));
  // Node normalizes its script argument to an absolute path before preloads run.
  // Restore the runner's relative entry token (cli or .) for the fixture body.
  await writeFile(preload, `
if (require('node:path').resolve(process.execPath) === ${JSON.stringify(bin)}) {
  const result = require('node:child_process').spawnSync(${JSON.stringify(process.execPath)},
    [${JSON.stringify(body)}, require('node:path').relative(process.cwd(), process.argv[1]) || '.', ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
  process.exit(result.status ?? 1);
}
`);
  return { bin, env: { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require=${JSON.stringify(preload)}`.trim() } };
}

export async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

export async function removeCliFixture(dir) {
  // 仅重试 Node 认可的临时清理错误，等待 Windows 释放可执行文件锁。
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
