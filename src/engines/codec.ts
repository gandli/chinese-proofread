// 纯函数：tokenize + postprocess，无 onnxruntime-web 依赖
// vitest 可安全测试

const CLS_ID = 101;
const SEP_ID = 102;
const UNK_ID = 100;

export interface DiffEntry {
  original: string;
  corrected: string;
  position: number;
  confidence: number;
}

export interface CorrectionResult {
  original: string;
  corrected: string;
  diffs: DiffEntry[];
}

export function tokenize(text: string, invVocab: Map<string, number>): number[] {
  const ids = [CLS_ID];
  for (const ch of text) ids.push(invVocab.get(ch) ?? UNK_ID);
  ids.push(SEP_ID);
  return ids;
}

export function postprocess(
  text: string,
  data: Float32Array,
  vocabSize: number,
  vocab: string[],
  threshold: number,
): CorrectionResult {
  const chars = Array.from(text);
  const diffs: DiffEntry[] = [];
  let corrected = '';
  const posLogits = new Float32Array(vocabSize);

  for (let i = 0; i < chars.length; i++) {
    const offset = (i + 1) * vocabSize;
    let max = -Infinity, maxIdx = 0;
    for (let v = 0; v < vocabSize; v++) {
      const val = data[offset + v];
      posLogits[v] = val;
      if (val > max) { max = val; maxIdx = v; }
    }
    let sumExp = 0;
    for (let v = 0; v < vocabSize; v++) sumExp += Math.exp(posLogits[v] - max);
    const prob = 1 / sumExp;

    const origChar = chars[i];
    let predChar = (vocab[maxIdx] ?? origChar).replace(/^##/, '');
    if (predChar.startsWith('[')) predChar = origChar;

    if (prob >= threshold && predChar !== origChar) {
      corrected += predChar;
      diffs.push({ original: origChar, corrected: predChar, position: i, confidence: prob });
    } else {
      corrected += origChar;
    }
  }
  return { original: text, corrected, diffs };
}
