# Changelog

All notable changes to MatrixMedia are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.14.7-rc.1] - 2026-11-09

### 修复
- 等待平台确认时保留原任务、发表/草稿意图和消息，拒绝旧代次与迟到回执覆盖终态。
- Windows MCP 启动时清除继承的 Electron Node 模式，开发模式优先使用真实可执行文件。
- 校准分组、多代理和发布设置测试，并修复 Windows 路径与原生测试夹具兼容性。

### 验证与构建
- 增加 `yarn test:release --with-gui` 受控门禁，真实统计凭据探针单独列明。
- PR 检查覆盖 Windows/Linux、真实 DOM、GUI 与 MCP；可手动构建候选产物。
- 带预发布后缀的版本发布时标记为 prerelease；手动候选构建不发布 Release。

## [0.5.4] - 2026-05-06

### Added
- `verify-cli.sh` — automated CLI contract verification script.
  Tests exit codes (0 success / 2 arg-error / 3 business-failure) and
  `--json` output purity for `cli accounts` and `cli history`.
  22 assertions across 5 sections; env-dependent cases are SKIP'd, not FAIL'd.
  Run: `bash verify-cli.sh [--verbose]`

### Fixed
- `.gitignore`: added `.claude/` to prevent accidental commit of IDE internals.

### Build
- `dist/electron/main.js` rebuilt from current source (`yarn build:dir`).

---

## [0.5.3] - 2026-05-05

### Added
- `cli accounts` — list all accounts and probe real-time cookie login status.
- `cli history` — read `pushData` publish history; supports platform / phone / status / date filters.
- `cli accounts --json` / `cli history --json` — machine-readable JSON stdout for AI agent pipelines.
- `CLI_SKILLS.md` — pointer to `.cursor/skills/matrixmedia-cli-publish/SKILL.md`.
- `scripts/gen-release-notes.js` — helper for generating release notes.
- `scripts/test-scheduled-publish.js` — smoke test for the scheduled-publish flow.
- Exit code contract: `0` success / `1` unexpected error / `2` arg error / `3` business failure.

### Changed
- README: documented CLI exit codes, `--json` flags, AI agent integration guide.
- README: added macOS PATH setup instructions (`sudo ln -sf ...`).

---

## [0.5.2] - 2026-04-xx

### Added
- Scheduled publish (`--publish-at "YYYY-MM-DD HH:mm:ss"`) via `cli publish`.
- `createScheduledRecord` / `startScheduledPublishScheduler` — scheduled task engine.

---

## [0.5.1] - 2026-04-xx

### Added
- `cli login` for Douyin: terminal QR code + Puppeteer headless mode.
- `cli publish` for all 6 platforms via Electron session partitions.

---

## [0.5.0] - 2026-03-xx

### Added
- Initial CLI entry point (`argv` containing `cli` triggers headless mode).
- `detect Argv` / `parsePublishArgs` / `parseLoginArgs` parsers.

---

## [0.4.x] - 2026-03-xx

- GUI-only releases: batch video publishing, account management, platform support.

---

## [0.3.x] - 2026-03-xx

- Early releases: Douyin, Kuaishou, Bilibili, Baidu Baijiahao, Toutiao, WeChat Channel.
