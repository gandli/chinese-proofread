# Chrome Web Store Listing — Chinese Proofread Extension

> Last Updated: 2026-08-19

## Store Listing

**Extension Name**
中文校对助手 - 本地离线 AI 校对扩展

**Short Description**
本地离线中文长文智能校对工具，基于 MacBERT4CSC Q8 模型，支持红波浪浪线高亮、点击气泡采纳/忽略、原地修正、撤销重做、侧边栏错误列表、行业词库管理，完全离线运行，无数据上传。

**Detailed Description**
中文校对助手是一个专为中文写作场景设计的浏览器扩展，采用本地离线 AI 模型（MacBERT4CSC Q8，114MB）在浏览器端直接推理，无需联网、无数据上传，保护隐私。

**核心功能**

- **红波浪浪线高亮**：使用 CSS Custom Highlights (::highlight) 非侵入式标记错误，不污染页面 DOM，性能优异
- **点击即用**：点击红波浪线 → 原生 Popover API 气泡 → 采纳/忽略/撤销，操作直观流畅
- **原地修正**：Range.replaceWith (ES2022) 自动处理跨节点合并相邻文本节点
- **多级撤销重做**：Ctrl+多级撤销栈 + Ctrl面板按钮 + 键盘快捷键，误操作无忧
- **侧边栏总览**：Side Panel 错误列表 + 跳转定位 + 批量采纳/忽略
- **编辑器原生支持**：contenteditable / textarea / input 直接在编辑器中修正
- **行业词库管理**：Options 页面可视化增删改查、多域标签过滤、JSON 导入导出、实时生效无需重载

**工作流程**

1. 安装扩展后，在任意网页点击扩展图标或打开侧边栏
2. 点击"开始校对"，模型在本地 WebGPU 分段推理（约 3-8 秒）
3. 页面显示红色波浪线下划，点击任一处 → 气泡显示原词/纠正词/置信度
4. 点击"采纳" → 页面原地替换；点击"忽略" → 仅移除高亮
5. 侧边栏可查看所有错误、批量操作、点击跳转定位
6. Options 页面管理行业词库（烟草/医疗/法律/金融/科技五域），支持导入导出 JSON
7. 撤销重做按钮或 Ctrl+ `Ctrl+Z` / `Ctrl+Shift+Z` 随时撤销/恢复

**隐私与权限说明**

- 仅使用 `storage` 权限保存词库配置，`sidePanel` 权限打开侧边栏
- 所有数据存储在浏览器本地，不上传任何云端
- 模型文件（119MB ONNX + 词表）随扩展打包，完全离线推理

**适用场景**

- 烟草/稿件/邮件/文档的中文校对
- 烟草行业专业术语（烟丝/焦油量/卷烟/钢印/喷码/专卖/稽查/零售户等）防误报
- 法律/医疗/金融/科技等领域专业文档的术语纠正

**Category**
Developer Tools

**Single Purpose**
本地离线 AI 中文校对扩展，点击红波浪线即可原地修正，支持撤销重做与侧边栏批量管理。

**Primary Language**
Chinese (Simplified)

## Graphics & Assets

| Asset              | Dimensions  | Status         | Filename                                  |
| ------------------ | ----------- | -------------- | ----------------------------------------- |
| Store Icon         | 128×128 PNG | ✅ Ready       | assets/icon-128.png                       |
| Screenshot 1       | 1280×800    | ✅ Ready       | screenshots/01-popup-idle.png             |
| Screenshot 2       | 1280×800    | ✅ Ready       | screenshots/02-popup-correcting.png       |
| Screenshot 3       | 1280×800    | ✅ Ready       | screenshots/03-popup-result.png           |
| Screenshot 4       | 1280×800    | ✅ Ready       | screenshots/04-page-highlight.png         |
| Screenshot 5       | 1280×800    | ✅ Ready       | screenshots/05-sidepanel.png              |
| Screenshot 6       | 1280×800    | ✅ Ready       | screenshots/06-popup-idle-after-clear.png |
| Screenshot 7       | 1280×800    | ✅ Ready       | screenshots/07-options.png                |
| Promo Tile         | 440×280     | ⬜ Not created |                                           |
| Marquee Promo Tile | 1400×560    | ⬜ Not created |                                           |

## Permissions Justification

| Permission                   | Type             | Justification                                                |
| ---------------------------- | ---------------- | ------------------------------------------------------------ |
| storage                      | permissions      | 保存用户词库配置、撤销栈状态、同步侧边栏数据，无需服务器同步 |
| sidePanel                    | permissions      | 打开侧边栏显示错误列表、批量操作、跳转定位                   |
| host_permissions: <all_urls> | host_permissions | 在任意网页提取正文、高亮错误、点击气泡修正、编辑器原地修正   |

## Privacy & Data Use

**Does the extension collect user data?**
No

**Data Use Certification**

- ✅ Data is NOT sold to third parties
- ✅ Data is NOT used for purposes unrelated to the extension's core functionality
- ✅ Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://gandli.github.io/chinese-proofread/privacy-policy.html

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name**: gandli
**Contact Email**: gandli@outlook.com
**Support URL**: https://github.com/gandli/chinese-proofread/issues
**Homepage URL**: https://github.com/gandli/chinese-proofread

## Version History

| Version | Date       | Changes                                                                                   | Status |
| ------- | ---------- | ----------------------------------------------------------------------------------------- | ------ |
| 0.1.0   | 2026-08-19 | 初版发布：Proofly 风格重构 + Side Panel + 行业词库 + 撤销重做 + 编辑器支持 + 使用手册截图 | Draft  |

## Review Notes

### Known Issues / Limitations

- 模型体积较大（119MB ONNX + 词表 + WASM），首次加载需下载
- 仅支持 Chromium 内核浏览器（Chrome/Edge/Brave 等）
- 离线模型推理需 WebGPU 支持，旧设备回退 WASM 会较慢
- 词库功能需手动导入/导出，暂不支持云端同步

### Rejection History

| Date | Reason | Fix Applied | Resubmitted |
| ---- | ------ | ----------- | ----------- |
|      |        |             |             |

```json
{
  "permissions": ["storage", "sidePanel"],
  "host_permissions": ["<all_urls>"],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self'"
  }
}
```
