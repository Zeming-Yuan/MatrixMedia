# Windows 0.14.7-rc.1 候选包验收

本记录区分源码测试、安装包测试与正式发布。候选版本由用户确认为 `0.14.7-rc.1`；尚未发布 GitHub Release，也未推送 `prod`。

## 环境与产物

- Windows 10 x64（19045），Node 20.20.2、Yarn 1.22.22、Electron 24.8.8。
- 发布业务基线为已合并的 `edce0bf239a835bd34974723d665f7e0d28683f7`；候选包使用本 PR 的 `3fc0c58` 产品源码。后续提交调整测试、CI、锁文件下载地址和文档，不改包内发布业务代码。
- 构建：`yarn build --publish never --config.electronDist=node_modules/electron/dist --config.nsis.createDesktopShortcut=false --config.nsis.createStartMenuShortcut=false`，退出 0。本地验收包关闭快捷方式创建。
- 安装包：`D:\MatrixMedia\build\MatrixMedia-0.14.7-rc.1-win-x64.exe`，71,620,481 字节。
- SHA256：`A3460AE16AC77F441704CC6716B443D94E70AAC1BFA96630770627EC5FC8C4E5`。
- 安装目录：`D:\DevTools\Apps\MatrixMediaCandidate-0.14.7-rc.1`。已读取安装目录 `resources/app.asar` 中的 `package.json`，版本确认为 `0.14.7-rc.1`。

## 安装故障与恢复

本轮验收误把带空格目录直接传入 NSIS `/D` 参数，实际安装目录被截断成源码目录 `D:\MatrixMedia`。后续安装尝试卸载该目录，出现 `Failed to uninstall old application files ... : 2`。这是验收命令错误，不能据此宣称所有安装器问题已修复。

已停止该次安装进程，不运行指向源码目录的卸载程序。先导出该候选版卸载注册表，再按 `build/win-unpacked` 清单逐文件核对 SHA256、拒绝任何 Git 跟踪路径，将本轮遗留的 23 个未跟踪文件移至 `D:\DevTools\Apps\MatrixMediaRuntime\misplaced-install-20261109`。清单及注册表备份保存在同目录。随后仅清理本候选版指向源码的卸载登记，未删除源码、账号、Cookie 或用户数据。

改用无空格独立目录后，首次安装与同版本覆盖重装均退出 0；卸载登记已指向候选目录，源码 `.git` 和 `package.json` 均存在。实际参数如下，`/D` 为最后一个参数：

```powershell
Start-Process -FilePath 'D:\MatrixMedia\build\MatrixMedia-0.14.7-rc.1-win-x64.exe' `
  -ArgumentList '/S /currentuser /D=D:\DevTools\Apps\MatrixMediaCandidate-0.14.7-rc.1' -Wait
```

临时交互安装计划任务已移除。此次验证覆盖新装和同版本重装；未验证其他历史版本升级、中文空格目录或代码签名。

## GUI / CLI / MCP 证据

| 链路 | 实际入口 | 结果 |
| --- | --- | --- |
| GUI 源码回归 | `node scripts/test-publish-waiting-confirmation-gui.js` | 真实 Electron/Vue/HTTP、隔离合成记录；等待确认，成功 0、失败 0、记录 1，交错终结保护通过 |
| GUI 安装版 | 直接启动安装目录 `matrixmedia.exe`，以 CDP 操作真实菜单 | 菜单加载并可点击“视频管理”，实际路由 `#/video-manager`；仅截取菜单，未公开账号或历史内容 |
| CLI 安装版 | 下述 `e2e/run.js --app` | `PASS_VERIFIED`，退出 0，`draftVerified=true`，默认隐藏窗口 |
| MCP 安装版 | Node 20 启动 `mcp/dist/index.js`，`MATRIXMEDIA_BIN` 指向安装程序 | `list_accounts`、`list_history` 调用成功；一次 `publish_video` 后仅轮询原 job，返回 `status=draft`、`publishMode=draft` |

![安装版的真实菜单（已进入视频管理）](./images/windows-rc1-installed-menu.png)

CLI 安装版命令：

```powershell
node e2e/run.js --app 'D:\DevTools\Apps\MatrixMediaCandidate-0.14.7-rc.1\matrixmedia.exe' `
  -p dy --yes --phone MatrixE2E --video e2e/artifacts/fixtures/windows-test-video.mp4 --timeout 120
```

原始报告留在 Windows：`D:\MatrixMedia\e2e\artifacts\20261109-091323\report.md` / `report.json`。不使用启动 shim，不加 `--show`。草稿保存后跳转到抖音上传页；平台回执与分类为通过，但 `--yes` 未进行人工后台核对。源码默认隐藏模式也已在 `20261109-083426` 通过；旧失败 `20261109-073818` 仍保留，未篡改分类或放宽验证条件。

MCP 父进程特意继承 `ELECTRON_RUN_AS_NODE=1`，runner 必须删除该变量才可启动真实安装程序。调用参数为 `platform=dy`、`phone=MatrixE2E`、合成视频、`draft=true`、`show=false`、`creativeStatement=ai_generated`。jobId 为 `1e5e9467-e68e-41ca-9039-706935008062`；证据摘要在本机 `D:\DevTools\Apps\MatrixMediaRuntime\candidate-mcp-result.json`。MCP 现有成功返回只提供状态、意图和消息，未返回 `draftVerified`；这里不把该字段缺失描述为验证通过。真实发布证据由上面的 CLI 原始报告提供。

安装版 GUI 仅验证启动与导航，等待确认的状态和计数由隔离 GUI 回归验证；未把合成事件测试描述为真实平台 GUI 上传。所有真实平台原始截图、账号与素材仅留本机，`MM-E2E` 测试草稿请核对后清理。

## 门禁与限制

Windows Node 20 本机已完成 `yarn test:release --with-gui`，76/76 通过；`yarn --cwd mcp test` 原生 13/13 通过、0 跳过，不再使用 POSIX 夹具替代启动器。MCP 依赖版本与 integrity 均未改变；99 个旧私有 HTTP 镜像下载地址改为 npm 官方 HTTPS 地址，根版本元数据对齐已有 `0.3.0`。

GitHub Actions 首轮 `42589633854` 未通过：双平台定时测试基准依赖北京时间，Linux Electron 沙箱权限不满足要求，Windows GUI 截图异常覆盖了原始错误。已统一测试本地时间基准、配置 Linux 测试沙箱并保留 GUI 原始错误及启动日志。修正后的 CI 结果需以 PR 检查为准，不能用本机 76/76 替代。

第二轮 `42592030253` 中 Linux 全部门禁通过；Windows 75/76，完整日志确认 GPU 子进程反复以 `-1073741819` 退出，最终 `GPU process isn't usable` 导致窗口关闭。Windows CI GUI 测试现显式设置 `MATRIXMEDIA_TEST_IN_PROCESS_GPU=1`，仅给测试 Electron 添加 `--in-process-gpu`；产品和本机默认验收均不依赖该参数。此参数是否解决虚拟环境故障需以随后 CI 结果为准。

四项真实平台统计探针需要真实凭据，明确列为独立人工验收，未计入 76 项通过。未验证其他发布平台、macOS 实机、历史版本升级及正式签名；本记录不代表全平台正式发布验收。
