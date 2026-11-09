"use strict";

// 使用真实 Electron / Vue / 本地 HTTP 数据服务；只隔离 HOME 与合成历史记录。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const puppeteer = require("puppeteer-core");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mm-waiting-gui-"));
const cache = path.join(root, "test/.cache/waiting-confirmation");
fs.mkdirSync(cache, { recursive: true });
const date = new Date().toLocaleDateString("en-CA");
const dataDir = path.join(temp, "Documents/MatrixMedia/data/pushData");
fs.mkdirSync(dataDir, { recursive: true });
const record = { id: "waiting-gui", textType: "local", pt: "抖音", phone: "fixture",
  taskId: "gui-task", publishSettled: false,
  partition: "persist:fixture抖音", textOtherName: "等待状态测试", selectedFile: "synthetic.mp4",
  bt: "等待状态测试", publishStatus: "publishing", publishAttemptCount: 1,
  publishSuccessCount: 0, publishFailCount: 0, date };
fs.writeFileSync(path.join(dataDir, date + ".json"), JSON.stringify([record]));
const wrapper = path.join(temp, "probe.cjs");
fs.writeFileSync(wrapper, `const {app}=require('electron');
app.setAppPath(${JSON.stringify(root)});
app.setPath('userData',${JSON.stringify(path.join(temp, "userData"))});
app.setPath('documents',${JSON.stringify(path.join(temp, "Documents"))});
require(${JSON.stringify(path.join(root, "dist/electron/main.js"))});
`);

async function main() {
  // Windows 上空值也可能开启 Node 模式，必须彻底移除继承的变量。
  const childEnv = { ...process.env, HOME: temp, XDG_CONFIG_HOME: path.join(temp, ".config"),
    MATRIXMEDIA_DISABLE_TELEMETRY: "1" };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const startupLog = path.join(cache, "gui-startup.log");
  fs.writeFileSync(startupLog, "");
  let output = "";
  const recordOutput = text => {
    output += text;
    fs.appendFileSync(startupLog, text);
  };
  const bestEffort = async (label, action) => {
    try {
      await action();
    } catch (error) {
      recordOutput(`\n[diagnostic ${label}] ${error.stack || error}\n`);
    }
  };
  const child = spawn(require("electron"), [wrapper, "--disable-gpu"], {
    cwd: root,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const childClosed = new Promise(resolve => child.once("close", resolve));
  child.stdout.on("data", chunk => recordOutput(chunk.toString()));
  child.stderr.on("data", chunk => recordOutput(chunk.toString()));
  child.once("exit", (code, signal) => recordOutput(`\n[child exit] code=${code} signal=${signal}\n`));
  let browser;
  let page;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Electron CDP 启动超时: " + output.slice(-1200))), 25000);
      const collect = () => {
        const match = output.match(/ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.once("exit", (code, signal) => { clearTimeout(timer); reject(new Error("Electron 提前退出 code=" + code + " signal=" + signal + ": " + output.slice(-1200))); });
      child.once("error", error => { clearTimeout(timer); recordOutput(`\n[child error] ${error.stack || error}\n`); reject(error); });
    });
    browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
    const target = await browser.waitForTarget(t => t.url().includes("/dist/electron/index.html"), { timeout: 25000 });
    page = await target.page();
    page.on("pageerror", error => recordOutput("\n" + error.stack));
    await page.setViewport({ width: 1400, height: 900 });
    await page.waitForSelector("body");
    // 更新检查与菜单加载并行；按真实按钮关闭提示，避免遮罩吞掉菜单点击。
    await page.evaluate(() => {
      const dismissUpdate = () => {
        const dialog = [...document.querySelectorAll(".el-dialog")].find(el =>
          el.getClientRects().length && el.querySelector(".el-dialog__title")?.textContent === "发现新版本");
        const skip = dialog && [...dialog.querySelectorAll("button")]
          .find(el => el.textContent.trim() === "暂不更新");
        if (skip) { observer.disconnect(); skip.click(); }
      };
      const observer = new MutationObserver(dismissUpdate);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: ["style", "class"] });
      dismissUpdate();
    });
    await page.waitForSelector(".el-menu");
    const historyMenu = await page.waitForXPath('//li[normalize-space(.)="视频管理"]');
    assert.ok(historyMenu, "应能从应用菜单进入视频管理");
    // 关闭动画期间遮罩仍可拦截输入，等菜单真正接收点击后再继续。
    await page.waitForFunction(el => {
      const rect = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }, {}, historyMenu);
    await historyMenu.click();
    await page.waitForFunction(() => document.body.textContent.includes("等待状态测试"));
    const request = body => page.evaluate(async body => {
      const token = await require("electron").ipcRenderer.invoke("matrix:server-token");
      const response = await fetch("http://localhost:30088/changeData", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Matrix-Token": token },
        body: JSON.stringify(body),
      });
      return response.json();
    }, body);
    const emit = (channel, fields) => page.evaluate(({ channel, fields }) => {
      require("electron").ipcRenderer.emit(channel, {}, fields);
    }, { channel, fields: { ...record, taskId: "gui-task", ...fields } });
    const hasStatus = text => page.waitForFunction(text => [...document.querySelectorAll(".el-tag")]
      .some(el => el.textContent.trim() === text), { timeout: 4000 }, text);
    await emit("puppeteerFile-progress", { taskId: "old-task", phase: "waiting_confirmation" });
    await page.waitForNetworkIdle({ idleTime: 150, timeout: 3000 });
    assert.equal(await page.evaluate(() => [...document.querySelectorAll(".el-tag")]
      .some(el => el.textContent.trim() === "等待确认")), false, "其他任务的进度必须忽略");
    await emit("puppeteerFile-progress", { phase: "waiting_confirmation", message: "请扫码确认" });
    try {
      await hasStatus("等待确认");
    } catch (error) {
      await bestEffort("red screenshot", () => page.screenshot({ path: path.join(cache, "gui-red.png"), fullPage: true }));
      recordOutput("\n[assertion] 收到等待确认进度后 GUI 必须显示等待确认\n");
      throw error;
    }
    await emit("puppeteerFile-progress", { phase: "verifying" });
    await hasStatus("发布中");
    await emit("puppeteerFile-done", { status: true, outcome: "waiting_confirmation", needsAttention: true, message: "请到平台完成确认" });
    await hasStatus("等待确认");
    await emit("puppeteerFile-progress", { phase: "verifying" });
    await emit("puppeteerFile-done", { status: true });
    await page.waitForNetworkIdle({ idleTime: 150, timeout: 3000 });
    await hasStatus("等待确认");
    const stale = await request({ fileName: "pushData", type: "update", expectedTaskId: "gui-task",
      item: { id: record.id, date, publishStatus: "publishing" } });
    assert.equal(stale.success, false, "终结后的 HTTP 写入也必须被存储边界拒绝");
    assert.equal(stale.code, "stale_publish_task");
    const rows = (await request({ fileName: "pushData", type: "get", item: { page: 1, pageSize: 100 } })).data;
    const items = Object.values(rows).flat().flatMap(row => row.showAlltype || [row]);
    assert.equal(items.length, 1);
    assert.equal(items[0].publishStatus, "waiting_confirmation");
    assert.equal(items[0].publishSuccessCount, 0);
    assert.equal(items[0].publishFailCount, 0);
    const race = { ...record, id: "race", taskId: "race-task", textOtherName: "交错事件", selectedFile: "race.mp4" };
    assert.equal((await request({ fileName: "pushData", type: "add", item: race })).success, true);
    const [terminal, progress] = await Promise.all([
      request({ fileName: "pushData", type: "update", expectedTaskId: race.taskId,
        item: { id: race.id, date, publishStatus: "waiting_confirmation", publishSettled: true } }),
      request({ fileName: "pushData", type: "update", expectedTaskId: race.taskId,
        item: { id: race.id, date, publishStatus: "publishing" } }),
    ]);
    assert.equal(terminal.success, true);
    assert.ok(progress.success || progress.code === "stale_publish_task");
    const afterRace = (await request({ fileName: "pushData", type: "get", item: {} })).data;
    const raceRow = Object.values(afterRace).flat().find(row => row.id === race.id);
    assert.equal(raceRow.publishStatus, "waiting_confirmation", "交错的进度和终结写入不能降级终态");
    assert.equal(raceRow.publishSettled, true);
    await request({ fileName: "pushData", type: "delete", item: { id: race.id, date } });
    await page.screenshot({ path: path.join(cache, "gui-waiting-confirmation.png"), fullPage: true });
    fs.writeFileSync(path.join(cache, "gui-result.json"), JSON.stringify({ status: items[0].publishStatus,
      successCount: items[0].publishSuccessCount, failCount: items[0].publishFailCount, records: items.length, concurrentTerminalProtected: true }));
    console.log("GUI waiting_confirmation / zero success / one record: passed");
  } catch (error) {
    recordOutput(`\n[test error] ${error.stack || error}\n`);
    if (page) {
      await bestEffort("error screenshot", () => page.screenshot({ path: path.join(cache, "gui-error.png"), fullPage: true }));
      await bestEffort("page text", async () => {
        fs.writeFileSync(path.join(cache, "gui-page.txt"), await page.evaluate(() => document.body.innerText));
      });
    }
    throw error;
  } finally {
    if (browser) await bestEffort("browser disconnect", () => browser.disconnect());
    child.kill("SIGTERM");
    const forceExit = setTimeout(() => child.kill("SIGKILL"), 2000);
    await childClosed;
    clearTimeout(forceExit);
    await bestEffort("temporary files", () => fs.rmSync(temp, { recursive: true, force: true }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
