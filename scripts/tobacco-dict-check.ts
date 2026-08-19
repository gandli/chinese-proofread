// 烟草稽查行业文本误报检测：跑模型 + 应用自定义词典，对比前后
// 运行: bun scripts/tobacco-dict-check.ts
import { MacBertCorrector } from "../src/engines/macbert";
import { splitLongText, mergeDiffs } from "../src/utils/splitter";
import {
  loadCustomDictNode,
  applyCustomDictNode,
} from "../src/utils/custom-dict.node";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 烟草稽查真实场景文本（检查报告/案件描述风格）
const text = [
  "本月专卖稽查大队对辖区零售户开展例行检查，查获涉嫌假冒卷烟12条，涉案金额约1300元。",
  "经鉴定，该批烟支包装粗糙，钢印摸糊，喷码与条盒物流码不符，属于假冒注册商标商品。",
  "据零售户交代，货物系从上游烟贩处批良购入，无烟草专卖品准运证，已移交专卖科立案查处。",
  "现场查获烟丝25公斤、滤嘴棒3箱、盘纸2箱，以及卷烟包装机一台，涉嫌非法生产烟草制品。",
  "此次专项行动重点打击网络售烟，通过网络寄递渠道销售假烟的行为将被从严处置。",
  "卷烟吸阻、焦油量、烟气烟碱量等指标检测结果与真品存在显著查异。",
  "对涉案卷烟进行抽样送检，经质检站判定为伪劣卷烟，予以没收并销毁。",
].join("");

const c = new MacBertCorrector(
  path.resolve(__dirname, "../public/models/model_quantized.onnx"),
  path.resolve(__dirname, "../public/models/vocab.txt"),
);
await c.init();

const chunks = splitLongText(text, 510, 20);
const chunkDiffs = await Promise.all(
  chunks.map(async (ch) => (await c.correct(ch.text)).diffs),
);
const diffs = mergeDiffs(chunks, chunkDiffs);

console.log(`原文 ${text.length} 字 | 模型检出 ${diffs.length} 处:`);
for (const d of diffs) {
  console.log(
    `  #${d.position} "${d.original}" → "${d.corrected}" (${(d.confidence * 100).toFixed(0)}%)`,
  );
}

// 应用自定义词典
loadCustomDictNode();
const after = applyCustomDictNode(text, diffs);
console.log(`\n词典过滤后 ${after.length} 处:`);
for (const d of after) {
  console.log(
    `  #${d.position} "${d.original}" → "${d.corrected}" (${(d.confidence * 100).toFixed(0)}%)`,
  );
}
