# 长文本纠错助手 · Contribution Guide

> 本项目是一个 **完全本地、隐私保护** 的中文文字校对 Chrome 扩展。  
> 无论您是想修复 bug、添加功能，还是提升文档质量，都欢迎加入！

## 🛠️ 开发环境

1. **安装依赖**
   ```bash
   bun install
   ```

2. **下载模型（一次性）**
   ```bash
   bun run setup:model   # 从 Hugging Face 下载 114MB 量化模型到 public/models/
   ```

3. **启动开发服务器**
   ```bash
   bun dev
   ```
   - 打开 Chrome → `chrome://extensions/` → 开启“开发者模式” → “加载已解压的扩展” → 选择 `.output/chrome-mv3` 目录.

## 📜 代码风格

- **提交信息**：符合 [Conventional Commits](https://www.conventionalcommits.org/) 规范
  - `feat(auth): 增加登录按钮`
  - `fix(ui): 修复侧边栏对齐`
  - `chore(dev): 增加依赖缓存`
- **分支命名**：使用语义化前缀
  - `feat/` 新功能
  - `fix/` 修复缺陷
  - `docs/` 文档变更
  - `chore/` 构建/工具链
- **代码风格**：使用 `prettier` + `eslint`，已在项目根目录配置。

## ✅ 测试 & 合并流程

1. **运行完整检查**
   ```bash
   bun run compile && bun run lint && bun run test && bun run build
   ```

2. **创建功能分支**
   ```bash
   git checkout -b feat/add-dropdown-menu
   ```

3. **提交代码并推送**
   ```bash
   git push origin feat/add-dropdown-menu
   ```

4. **打开 Pull Request**
   - 标题格式：`type(scope): 描述`
   - 必须通过 CI（所有测试通过）
   - 需通过 `@gandli` 或其他维护者审查
   - 必须关联一条已关闭的 Issue（如适用）

5. **合并前检查列表**
   - ✅ 代码已通过 lint & test
   - ✅ 文档已更新（若有 UI/功能变更）
   - ✅ **不直接推送到 `main`**，必须通过 PR

## 📦 发布流程

1. **打标签并推送**
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```

2. **GitHub 自动触发 Release 工作流**
   - 自动打包 `.zip` 扩展包
   - 自动生成 `checksums.txt`
   - 自动创建 Release 第一个故事点

## 🙏 感谢贡献者

所有贡献者都将在 `CHANGELOG.md` 中永久保留姓名（按 PR 提交顺序）。