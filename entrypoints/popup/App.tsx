import { useState, useEffect, useRef } from 'react';
import './popup.css';

type Status = 'idle' | 'extracting' | 'loading' | 'correcting' | 'done' | 'error';

interface Diff {
  position: number;
  original: string;
  corrected: string;
  confidence: number;
}

// 校对波浪线 — 项目签名元素（与 hero SVG 同源）
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
    case 'extracting': return '提取正文';
    case 'loading': return '加载模型 (114MB)';
    case 'correcting': return '正在校对';
    case 'done': return '重新校对';
    case 'error': return '重试';
  }
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [errMsg, setErrMsg] = useState('');
  const [stats, setStats] = useState<{ chars: number; timeMs: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const popRef = useRef<HTMLDivElement>(null);

  // 点击气泡外部关闭
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setActiveIdx(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function run() {
    setErrMsg('');
    setDiffs([]);
    setStats(null);
    setApplied(new Set());
    setActiveIdx(null);
    setStatus('extracting');
    try {
      const t0 = performance.now();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('未找到活动标签页');

      const extracted = await chrome.tabs.sendMessage(tab.id, { type: 'extract' });
      const text: string = extracted?.text ?? '';
      if (!text) throw new Error('未能提取到页面正文');

      setStatus('loading');
      const resp = await chrome.runtime.sendMessage({ type: 'proofread', text });
      if (!resp.ok) throw new Error(resp.error);

      setDiffs(resp.result.diffs);
      setStats({ chars: text.length, timeMs: Math.round(performance.now() - t0) });
      setStatus('done');

      if (resp.result.diffs.length > 0) {
        await chrome.tabs.sendMessage(tab.id, { type: 'highlight', diffs: resp.result.diffs });
      }
    } catch (err) {
      setStatus('error');
      setErrMsg(String(err));
    }
  }

  function applyFix(idx: number) {
    const next = new Set(applied);
    next.add(idx);
    setApplied(next);
    setActiveIdx(null);
  }

  const remaining = diffs.length - applied.size;
  const isBusy = BUSY.includes(status);

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
        <p className={`status${remaining === 0 ? ' status--ok' : ''}`}>
          {diffs.length === 0
            ? '未发现错别字 ✓'
            : remaining === 0
              ? '全部已修正 ✓'
              : `${remaining} 处待处理`}
          <span> · {stats.chars} 字 · {stats.timeMs / 1000}s</span>
        </p>
      )}

      {diffs.length > 0 && (
        <div className="bubble-list">
          {diffs.map((d, i) => {
            const done = applied.has(i);
            return (
              <div key={i} className="bubble-item">
                <button
                  className={`bubble-trigger${done ? ' bubble-trigger--done' : ''}`}
                  onClick={() => setActiveIdx(activeIdx === i ? null : i)}
                  aria-expanded={activeIdx === i}
                >
                  <Squiggle size={14} color={done ? '#047857' : '#ef4444'} />
                  <span className="bubble-trigger-text">
                    <del className={done ? 'bubble-fix' : ''}>{d.original}</del>
                    {done && <span> → <strong>{d.corrected}</strong></span>}
                  </span>
                </button>

                {activeIdx === i && !done && (
                  <div className="bubble" ref={popRef} role="dialog">
                    <div className="bubble-change">
                      <del>{d.original}</del>
                      <span className="bubble-arrow">→</span>
                      <strong className="bubble-new">{d.corrected}</strong>
                    </div>
                    <div className="bubble-meta">
                      <span>位置 #{d.position}</span>
                      <span className="bubble-conf">{(d.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="bubble-actions">
                      <button className="bubble-accept" onClick={() => applyFix(i)}>采用</button>
                      <button className="bubble-ignore" onClick={() => setActiveIdx(null)}>忽略</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <footer className="footer">
        <span className="dot" /> 文字不出浏览器 · 数据不上传
      </footer>
    </div>
  );
}
