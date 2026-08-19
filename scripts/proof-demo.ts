// 一段话校对测试 + 生成高亮 HTML 展示
// 运行: bun scripts/proof-demo.ts → 输出 /tmp/proof-demo.html + 打印 diff
import { MacBertCorrector } from "../src/engines/macbert";
import { splitLongText, mergeDiffs } from "../src/utils/splitter";

const text = `今天早上我骑自行车去公司，路上碰到一个老同学，他说最近在写一篇关于环保的轮文，希望能得到我的意见。中午我和同事去吃饭，那家店的菜做的很号吃，就是人太多要排对。下午开会时领导布置了新任务，让我明天之前完成报告。下班后我去了趟超市，买了一些水果和日用品。晚上回家看了会电视，然后开始写作页，一直写到十一点才休息。`;

import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const c = new MacBertCorrector(
  path.resolve(__dirname, "../public/models/model_quantized.onnx"),
  path.resolve(__dirname, "../public/models/vocab.txt"),
);
// bun 环境解析到 ort.node 原生版（直接读文件，无需 wasmPaths 配置）
await c.init();
const chunks = splitLongText(text, 510, 20);
const chunkDiffs = await Promise.all(
  chunks.map(async (ch) => (await c.correct(ch.text)).diffs),
);
const diffs = mergeDiffs(chunks, chunkDiffs);
console.log(`字数: ${text.length} | 检出: ${diffs.length} 处`);
for (const d of diffs) {
  console.log(
    `  #${d.position} "${d.original}" → "${d.corrected}" (${(d.confidence * 100).toFixed(0)}%)`,
  );
}

// 生成高亮 HTML：错别字红波浪线 + 悬停见修正词
let html = text;
for (const d of diffs.slice().reverse()) {
  html =
    html.slice(0, d.position) +
    `<mark title="${d.original} → ${d.corrected}" style="background:transparent;text-decoration:underline wavy #ef4444 2px;color:inherit">${d.original}</mark>` +
    html.slice(d.position + d.original.length);
}
const out = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8">
<title>校对高亮演示</title>
<style>body{font:18px/2 -apple-system,"PingFang SC",sans-serif;max-width:720px;margin:3rem auto;padding:0 1.5rem;color:#1a2233}
h1{font-size:22px;margin-bottom:1.2rem}mark{cursor:help}
.legend{font-size:14px;color:#5a6a82;margin-bottom:1.5rem}
.fixed{margin-top:2rem;padding:1.2rem 1.5rem;background:#f4f6fa;border-radius:10px;font-size:15px;color:#5a6a82}
.fixed b{color:#047857;font-weight:600}</style></head><body>
<h1>📝 一段话校对 · 高亮演示</h1>
<p class="legend">红色波浪线 = 疑似错别字，悬停查看修正建议</p>
<p>${html}</p>
<div class="fixed">${diffs.map((d) => `「<b>${d.original}</b>」→「<b>${d.corrected}</b>」`).join("　") || "未发现错误"}</div>
</body></html>`;
Bun.write("/tmp/proof-demo.html", out);
console.log("HTML → /tmp/proof-demo.html");
