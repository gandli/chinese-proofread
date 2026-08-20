# 贡献指南

## 开发

```bash
bun install
bun run setup:model   # 下载 114MB 模型到 public/models/
bun dev               # chrome://extensions → 加载 .output/chrome-mv3
bun run compile && bun run lint && bun run test && bun run build
```

## 提交规范

- 分支：`feat/*` `fix/*` `chore/*` `docs/*`
- 提交信息：`type(scope): subject`（如 `fix(flow): ...`）
- PR：需通过 `qa` + `e2e`，禁止 `push main`

## 审计

详见 `.audit-reports/audit-report-chinese-proofread-2026-08-20.md`，P0/P1 需清零后提 PR。

