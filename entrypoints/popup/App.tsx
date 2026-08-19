// Popup: 极简状态面板 + 触发入口
// 页面交互（高亮点击 → popover）已在 content.ts 完成
import { useState, useRef } from 'react';
import './popup.css';
import { MacBertCorrector } from '../../src/engines/macbert';
import { splitLongText, mergeDiffs } from '../../src/utils/splitter';
import { loadCustomDict, applyCustomDict } from '../../src/utils/custom-dict';

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

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [errMsg, setErrMsg] = useState('');
  const [stats, setStats] = useState<{ chars: number; timeMs: number } | null>(null);
  const tabRef = useRef<chrome.tabs.Tab[]>([]);

  // 测试钩子：允许直接注入状态（供 e2e 截图用）
  if (typeof window !== 'undefined') {
    (window as any).__TEST__ = (window as any).__TEST__ || {};
    (window as any).__TEST__.setState = (partial: Partial<{
      status: Status;
      diffs: Diff[];
      stats: { chars: number; timeMs: number } | null;
      errMsg: string;
    }>) => {
      if (partial.status) setStatus(partial.status);
      if (partial.diffs) setDiffs(partial.diffs);
      if (partial.stats !== undefined) setStats(partial.stats);
      if (partial.errMsg !== undefined) setErrMsg(partial.errMsg);
    };
  }

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
      let merged = mergeDiffs(chunks, chunkDiffs);

      // 应用自定义词典（行业专业词库）
      await loadCustomDict();
      merged = applyCustomDict(text, merged);

      setDiffs(merged);
      setStats({ chars: text.length, timeMs: Math.round(performance.now() - t0) });
      setStatus('done');

      if (merged.length > 0) {
        await chrome.tabs.sendMessage(tab.id, { type: 'highlight', fullText: text, diffs: merged, tabId: tab.id });
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
    }
    setDiffs([]);
    setStats(null);
    setStatus('idle');
  }

  const isBusy = BUSY.includes(status);
  const remaining = diffs.length;

  const actionBase = 'w-full px-3.5 py-[11px] text-sm font-medium text-white bg-text rounded-[9px] cursor-pointer text-left flex items-center gap-2 transition-colors duration-150 mb-1.5 hover:bg-[#2a3650] active:scale-[0.96] disabled:opacity-50 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <div className="app w-[380px] p-4">
      <header className="header flex items-center gap-2.5 mb-3.5">
        <div className="logo flex items-center justify-center w-[34px] h-[34px] rounded-[9px] bg-surface-2 border border-border">
          <Squiggle size={20} />
        </div>
        <div className="header-text">
          <h1 className="text-[15px] font-semibold leading-tight">中文校对助手</h1>
          <span className="badge flex items-center gap-[5px] mt-0.5 text-[11px] text-muted">
            <span className="dot w-1.5 h-1.5 rounded-full bg-success inline-block" />本地引擎 · 离线可用
          </span>
        </div>
      </header>

      <button
        className={cn(
          actionBase,
          'action',
          status === 'done' && 'action--done bg-success hover:bg-[#047857]',
          status === 'error' && 'action--error bg-accent hover:bg-[#dc2626]',
          isBusy && 'action--busy opacity-80',
        )}
        onClick={run}
        disabled={isBusy}
      >
        {isBusy && <span className="spinner inline-block w-[13px] h-[13px] border-2 border-white/35 border-t-white rounded-full align-[-2px] mr-[7px] animate-[spin_0.8s_linear_infinite]" />}
        <Squiggle size={16} color="#f87171" />
        {buttonLabel(status)}
      </button>

      {errMsg && <div className="error text-[12.5px] text-error bg-error-bg border border-error-border rounded-lg px-[11px] py-2.5 my-1.5 leading-normal">{errMsg}</div>}

      {status === 'done' && stats && (
        <p className={cn('status text-[12.5px] text-muted py-0.5 pb-2', remaining === 0 && 'text-success')}>
          {diffs.length === 0
            ? '未发现错别字 ✓'
            : remaining === 0
              ? '全部已修正 ✓'
              : `${remaining} 处错别字待处理`}
          <span> · {stats.chars} 字 · {(stats.timeMs / 1000).toFixed(1)}s</span>
        </p>
      )}

      {status === 'done' && diffs.length > 0 && (
        <button className={cn(actionBase, 'action--secondary', 'bg-surface text-text border border-border hover:bg-surface-2')} onClick={clearHighlights}>
          清除高亮
        </button>
      )}

      <footer className="footer mt-3.5 pt-2.5 border-t border-border text-[11px] text-muted flex items-center gap-[5px] tabular-nums">
        <span className="dot w-1.5 h-1.5 rounded-full bg-success inline-block" /> 文字不出浏览器 · 数据不上传
      </footer>
    </div>
  );
}
