import { useState } from 'react';

type Status = 'idle' | 'extracting' | 'loading' | 'correcting' | 'done' | 'error';

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [diffs, setDiffs] = useState<Array<{ position: number; original: string; corrected: string; confidence: number }>>([]);
  const [errMsg, setErrMsg] = useState('');

  async function run() {
    setStatus('extracting');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('无活动标签页');

      const extracted = await chrome.tabs.sendMessage(tab.id, { type: 'extract' });
      const text: string = extracted?.text ?? '';
      if (!text) throw new Error('未能提取到正文');

      setStatus('loading');
      // 传全文，长文分段由 background 的 splitLongText 处理
      const resp = await chrome.runtime.sendMessage({ type: 'proofread', text });
      if (!resp.ok) throw new Error(resp.error);

      setStatus('done');
      setDiffs(resp.result.diffs);
      if (resp.result.diffs.length > 0) {
        await chrome.tabs.sendMessage(tab.id, { type: 'highlight', diffs: resp.result.diffs });
      }
    } catch (err) {
      setStatus('error');
      setErrMsg(String(err));
    }
  }

  return (
    <div style={{ width: 380, padding: 16, fontFamily: 'system-ui' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>中文校对助手</h2>
      <button
        onClick={run}
        disabled={status === 'extracting' || status === 'loading' || status === 'correcting'}
        style={{ padding: '8px 16px', fontSize: 14, background: '#007aff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        {status === 'idle' && '校对当前页面'}
        {status === 'extracting' && '提取正文…'}
        {status === 'loading' && '首次加载模型(114MB)…'}
        {status === 'correcting' && '校对中…'}
        {status === 'done' && '重新校对'}
        {status === 'error' && '重试'}
      </button>

      {errMsg && <p style={{ color: '#b45309', fontSize: 12 }}>{errMsg}</p>}

      {status === 'done' && (
        <p style={{ fontSize: 14, marginTop: 12 }}>
          {diffs.length === 0 ? '未发现错别字' : `发现 ${diffs.length} 处疑似错误，已在页面高亮`}
        </p>
      )}

      {diffs.length > 0 && (
        <ul style={{ fontSize: 13, paddingLeft: 18, maxHeight: 300, overflow: 'auto' }}>
          {diffs.map((d, i) => (
            <li key={i}>
              位置 {d.position}：<del>{d.original}</del> → <strong>{d.corrected}</strong>
              <span style={{ color: '#888' }}> ({(d.confidence * 100).toFixed(1)}%)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}