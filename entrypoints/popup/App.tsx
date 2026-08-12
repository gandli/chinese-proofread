import { useState } from 'react';
import './popup.css';

type Status = 'idle' | 'extracting' | 'loading' | 'correcting' | 'done' | 'error';

interface Diff {
  position: number;
  original: string;
  corrected: string;
  confidence: number;
}

// 校对波浪线 — 项目签名元素（与 hero SVG 同源）
function Squiggle({ size = 20, color = '#f87171' }: { size?: number; color?: string }) {
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

const BUSY = ['extracting', 'loading', 'correcting'] as const;

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

  async function run() {
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

  const isBusy = BUSY.includes(status as any);

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
        className={`action${status === 'done' ? ' action--done' : ''}${status === 'error' ? ' action--error' : ''}`}
        onClick={run}
        disabled={isBusy}
      >
        {isBusy && <span className="spinner" />}
        {buttonLabel(status)}
      </button>

      {errMsg && <div className="error">{errMsg}</div>}

      {status === 'done' && stats && (
        <p className={`status${diffs.length === 0 ? ' status--ok' : ''}`}>
          {diffs.length === 0
            ? '未发现错别字 ✓'
            : `发现 ${diffs.length} 处疑似错误，已在页面高亮`}
          {stats && <span> · {stats.chars} 字 · {stats.timeMs / 1000}s</span>}
        </p>
      )}

      {diffs.length > 0 && (
        <ul className="diffs">
          {diffs.map((d, i) => (
            <li key={i} className="diff">
              <div className="diff-squiggle"><Squiggle size={14} /></div>
              <div className="diff-body">
                <div className="diff-change">
                  <span className="orig">{d.original}</span>
                  <span className="arrow">→</span>
                  <span className="fix">{d.corrected}</span>
                </div>
                <div className="diff-meta">
                  <span>#{d.position}</span>
                  <span className="conf">{(d.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="footer">
        <span className="dot" /> 文字不出浏览器 · 数据不上传
      </footer>
    </div>
  );
}
