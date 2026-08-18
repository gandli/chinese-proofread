// Popup: 极简状态面板 + 触发入口
// 页面交互（高亮点击 → popover）已在 content.ts 完成
import { useState, useRef } from 'react';
import './popup.css';
import { MacBertCorrector } from '../../src/engines/macbert';
import { splitLongText, mergeDiffs } from '../../src/utils/splitter';

let corrector: MacBertCorrector | null = null;
let correctorInit: Promise<MacBertCorrector> | null = null;
async function getCorrector(): Promise<MacBertCorrector> {
  if (corrector) return corrector;
  correctorInit ??= (async () => {
    const c = new MacBertCorrector(
      chrome.runtime.getURL('models/model_quantized.onnx'),
      chrome.runtime.getURL('models/vocab.txt'),
    );
    await c.init();
    return c;
  })();
  return (corrector = await correctorInit);
}

type Status = 'idle' | 'extracting' | 'loading' | 'correcting' | 'done' | 'error';

interface Diff {
  position: number;
  original: string;
  corrected: string;
  confidence: number;
}

function Squiggle({ size = 20, color = '#ef4444' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={Math.round(size / 2)} viewBox="0 0 20 10" fill="none" aria-hidden="true">
      <path
        d="M1 6 q2.25 -4 4.5 0 q2.25 4 4.5 0 q2.25 -4 4.5 0 q2.25 4 4.5 0"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const BUSY: readonly Status[] = ['extracting', 'loading', 'correcting'];

function buttonLabel(status: Status) {
  switch (status) {
    case 'idle': return '校对当前页面';
    case 'extracting': return '提取正文…';
    case 'loading': return '加载模型 (114MB)…';
    case 'correcting': return '正在校对…';
    case 'done': return '重新校对';
    case 'error': return '重试';
  }
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [errMsg, setErrMsg] = useState('');
  const [stats, setStats] = useState<{ chars: number; timeMs: number } | null>(null);
  const tabRef = useRef<chrome.tabs.Tab[]>([]);

  async function run() {
    setErrMsg('');
    setDiffs([]);
    setStats(null);
    setStatus('extracting');
    try {
      const t0 = performance.now();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('未找到活动标签页');
      tabRef.current = [tab];

      const extracted = await chrome.tabs.sendMessage(tab.id, { type: 'extract' });
      const text: string = extracted?.text ?? '';
      if (!text) throw new Error('未能提取到页面正文');

      setStatus('loading');
      const corrector = await getCorrector();
      const chunks = splitLongText(text, 510, 20);
      const chunkDiffs = await Promise.all(chunks.map(async (chunk) => {
        const res = await corrector.correct(chunk.text);
        return res.diffs;
      }));
      const merged = mergeDiffs(chunks, chunkDiffs);
      setDiffs(merged);
      setStats({ chars: text.length, timeMs: Math.round(performance.now() - t0) });
      setStatus('done');

      if (merged.length > 0) {
        await chrome.tabs.sendMessage(tab.id, { type: 'highlight', fullText: text, diffs: merged });
      }
    } catch (err) {
      setStatus('error');
      setErrMsg(String(err));
    }
  }

  function clearHighlights() {
    const [tab] = tabRef.current ?? [];
    if (tab?.id) {
      void chrome.tabs.sendMessage(tab.id, { type: 'clear-highlights' });
      setDiffs([]);
      setStats(null);
      setStatus('idle');
    }
  }

  const isBusy = BUSY.includes(status);
  const remaining = diffs.length;

  return (
    <div className="app">
      <header className="header">
        <div className="logo"><Squiggle size={20} /></div>
        <div className="header-text">
          <h1>中文校对助手</h1>
          <span className="badge"><span className="dot" />本地引擎 · 离线可用</span>
        </div>
      </header>

      <button
        className={`action${status === 'done' ? ' action--done' : ''}${status === 'error' ? ' action--error' : ''}${isBusy ? ' action--busy' : ''}`}
        onClick={run}
        disabled={isBusy}
      >
        {isBusy && <span className="spinner" />}
        <Squiggle size={16} color="#f87171" />
        {buttonLabel(status)}
      </button>

      {errMsg && <div className="error">{errMsg}</div>}

      {status === 'done' && stats && (
        <p className={remaining === 0 ? 'status status--ok' : 'status'}>
          {diffs.length === 0
            ? '未发现错别字 ✓'
            : remaining === 0
              ? '全部已修正 ✓'
              : `${remaining} 处错别字待处理`}
          <span> · {stats.chars} 字 · {(stats.timeMs / 1000).toFixed(1)}s</span>
        </p>
      )}

      {status === 'done' && diffs.length > 0 && (
        <button className="action action--secondary" onClick={clearHighlights}>
          清除高亮
        </button>
      )}

      <footer className="footer">
        <span className="dot" /> 文字不出浏览器 · 数据不上传
      </footer>
    </div>
  );
}