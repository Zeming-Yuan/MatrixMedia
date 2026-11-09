"use strict";

// 发布前的受控门禁；需要真实凭据的统计探针单独列出，不能计为通过。
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");

if (Number(process.versions.node.split(".")[0]) !== 20) {
  console.error("发布门禁必须使用 Node 20");
  process.exit(2);
}
const root = path.resolve(__dirname, "..");
const cache = path.join(root, "test/.cache/release");
fs.mkdirSync(cache, { recursive: true });
const manual = ["bilibili", "bjh", "douyin", "sph"].map(platform => ({
  file: `test-${platform}-stats.js`, reason: "需要本机真实平台统计凭据，独立验收",
}));
const excluded = new Set(manual.map(item => item.file));
const withGui = process.argv.includes("--with-gui");
const tests = fs.readdirSync(__dirname).filter(file => /^test-.*\.js$/.test(file)
  && !excluded.has(file) && (withGui || !file.endsWith("-gui.js"))).sort();
const results = [];
for (const file of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    cwd: root, encoding: "utf8", timeout: file.endsWith("-gui.js") ? 90000 : 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = (result.stdout || "") + (result.stderr || "");
  fs.writeFileSync(path.join(cache, file + ".log"), output);
  results.push({ file, exitCode: result.status, error: result.error?.message || null });
  console.log(`${result.status === 0 ? "PASS" : "FAIL"} ${file}`);
  if (result.status !== 0) console.error(output.slice(-4000));
}
let commit = "unknown";
try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch (_) {}
const failed = results.filter(result => result.exitCode !== 0);
const report = { schemaVersion: 1, commit, node: process.version, platform: process.platform,
  withGui, results, manual, passed: results.length - failed.length, failed: failed.length };
fs.writeFileSync(path.join(cache, "results.json"), JSON.stringify(report, null, 2));
console.log(`${report.passed}/${results.length} 通过；${failed.length} 失败；${manual.length} 项真实统计探针需独立验收`);
if (!withGui) console.log("GUI 未运行；正式发布验收必须加 --with-gui 并先构建根包");
process.exitCode = failed.length || tests.length === 0 ? 1 : 0;
