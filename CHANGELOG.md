# Changelog

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 SemVer。

## [Unreleased]

## [0.2.0] - 2026-08-21

### Added

- 治理文件：`SECURITY.md` / `CONTRIBUTING.md` / `CHANGELOG.md` / `.github/CODEOWNERS`
- `CHROMEWEBSTORE.md` 补 `host_permissions` 与 `wasm-unsafe-eval` 审核论据
- `custom-dict` 脏数据校验（`validateCustomDict`，非法条目 warn 跳过）

### Fixed

- P0 止血：`vitest`/`eslint` 误扫 vendored skill 导致 152 failed / lint 爆红
- CI `Actions` pin 到 commit SHA
- `ProofHighlighter` undo/redo 悬空容错（`isConnected` + try/catch）
- `content` → `sidepanel` `sync-diffs` 异步 reject 静默（`.catch`）
- `background` 日志统一走 `log.info`
- `splitter` 补 `overlap==maxChars-1` 边界用例（39→41）

### Changed

- `@mozilla/readability` 0.5.0→0.6.0（安全）
- 审计白皮书刷新至 `main @ bb97eae` · 87/100 已达标（P0/P1 清零）

## [0.1.0] - 2026-08-19

- 初版：WXT + React + Tailwind v4 + onnxruntime-web (MacBERT4CSC Q8)
- ContentScript 高亮/Popover/撤销栈，Popup/SidePanel/Options 三入口
- 审计 P0 止血 + P1 小补丁（见 `.audit-reports/`）

