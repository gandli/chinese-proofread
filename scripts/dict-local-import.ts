// 词典扩充：福建地方烟 + 进口烟 + 其他品类（增量，不覆盖已有）
// 运行: bun scripts/dict-local-import.ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CustomDictEntry {
  term: string;
  action: string;
  correctTo?: string;
  domains?: string[];
}

// 福建本土卷烟（闽烟体系：龙岩/厦门/福建中烟）
const FUJIAN = [
  // 福建中烟在售/历史品牌
  "七匹狼通仙", "七匹狼通运", "七匹狼蓝狼", "七匹狼红狼", "七匹狼白狼",
  "七匹狼软灰", "七匹狼硬红", "七匹狼古田", "七匹狼金砖", "七匹狼翠碧",
  "石狮", "石狮烟", "石狮软红", "石狮硬红", "石狮平安", "石狮蓝",
  "土楼", "土楼烟", "土楼传奇", "土楼梦", "土楼红",
  "古田", "古田烟", "古田金中支", "古田红军", "古田圣地", "古田红星",
  "红狼", "红狼烟", "灰狼", "白狼",
  "富健", "富健烟", "富健红", "富健蓝",
  "乘风", "乘风烟", "乘风破浪", "金桥英伦", "金桥红", "金桥蓝",
  "武夷", "武夷烟", "武夷红袍", "武夷大红袍",
  "海峡", "海峡烟", "海峡两岸", "鹭江", "鹭江烟", "闽江", "闽江烟",
  "鼓浪屿", "鼓浪屿烟", "厦门", "厦门烟", "龙岩", "龙岩烟",
  // 福建常见外省流入平价烟
  "红梅软", "红梅硬", "红金龙蓝", "红金龙红",
];

// 进口烟（中国在售合法进口 + 常见走私/水货品牌）
const IMPORTED = [
  "万宝路", "万宝路烟", "万宝路硬", "万宝路软", "万宝路冰", "万宝路薄荷",
  "555", "555烟", "三五", "三五烟", "三五经典", "三五国际",
  "骆驼", "骆驼烟", "骆驼无嘴", "骆驼软", "骆驼硬",
  "七星", "七星烟", "七星皇", "七星金", "七星薄荷",
  "好彩", "好彩烟", "好彩红", "好彩蓝", "好彩金",
  "希尔顿", "希尔顿烟", "希尔顿红", "希尔顿蓝",
  "箭牌", "箭牌烟", "箭牌薄荷", "登喜路", "登喜路烟",
  "建牌", "建牌烟", "百乐门", "百乐门烟", "柔和七星", "云斯顿", "云斯顿烟",
  "总督", "总督烟", "黑冰", "黑冰万宝路", "双爆珠",
  "铁塔猫", "铁塔猫烟", "阿里山", "阿里山烟", "宝岛", "宝岛烟",
  "kent", "健牌", "L&M", "威斯", "威斯烟",
];

// 其他品类（雪茄/烟斗/无烟）
const OTHER = [
  // 雪茄
  "雪茄", "雪茄烟", "手工雪茄", "机制雪茄", "小雪茄", "雪茄型",
  "哈瓦那", "哈瓦那雪茄", "古巴雪茄", "蒙特", "蒙特雪茄",
  "罗密欧", "罗密欧与朱丽叶", "高希霸", "高希霸雪茄",
  "威士忌桶", "大卫杜夫", "大卫杜夫雪茄", "雪茄剪", "雪茄盒",
  // 烟斗/无烟
  "烟斗", "烟斗烟丝", "斗丝", "烟斗丝", "石楠木", "石楠木烟斗",
  "鼻烟", "鼻烟壶", "嚼烟", "口含烟", "无烟烟草", "含烟",
  // 电子烟品类
  "电子烟", "电子烟烟弹", "烟弹", "雾化芯", "电子烟杆", "加热不燃烧烟具",
  "烟具", "加热棒", "低温烟", "HNB", "iqos", "IQOS", "悦刻", "悦刻烟弹",
  // 相关
  "烟标", "烟标收藏", "老烟标", "烟卡", "烟画",
];

function parseCustomDict(raw: string): { entries: CustomDictEntry[] } {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { entries?: unknown }).entries)) {
    throw new Error('Invalid custom-dict.json: missing entries array');
  }
  return parsed as { entries: CustomDictEntry[] };
}

const dictPath = path.resolve(__dirname, '../public/custom-dict.json');
const dict = parseCustomDict(readFileSync(dictPath, 'utf-8'));

const existing = new Set(dict.entries.map((e) => e.term));
let added = 0;
for (const term of [...FUJIAN, ...IMPORTED, ...OTHER]) {
  if (!existing.has(term)) {
    dict.entries.push({ term, action: 'ignore' });
    existing.add(term);
    added++;
  }
}
writeFileSync(dictPath, JSON.stringify(dict, null, 2) + '\n');
console.log(`福建 ${FUJIAN.length} + 进口 ${IMPORTED.length} + 其他 ${OTHER.length} = ${FUJIAN.length + IMPORTED.length + OTHER.length}，新增 ${added}，总计 ${dict.entries.length}`);