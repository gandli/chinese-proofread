import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './sidepanel.css';

interface Diff {
  position: number;
  original: string;
  corrected: string;
  confidence: number;
}

interface SidePanelState {
  diffs: Diff[];
  fullText: string;
  activeTabId: number | null;
}

function DiffItem({ diff, index, onAccept, onIgnore, onJump }: {
  diff: Diff;
  index: number;
  onAccept: (d: Diff) => void;
  onIgnore: (d: Diff) => void;
  onJump: (d: Diff) => void;
}) {
  return (
    <div className="diff-item">
      <div className="diff-header">
        <span className="diff-index">#{index + 1}</span>
        <span className="diff-confidence">{(diff.confidence * 100).toFixed(0)}%</span>
      </div>
      <div className="diff-change">
        <del>{diff.original}</del>
        <span className="arrow">→</span>
        <strong>{diff.corrected}</strong>
      </div>
      <div className="diff-actions">
        <button className="btn btn-accept" onClick={() => onAccept(diff)}>采用</button>
        <button className="btn btn-ignore" onClick={() => onIgnore(diff)}>忽略</button>
        <button className="btn btn-jump" onClick={() => onJump(diff)}>跳转</button>
      </div>
    </div>
  );
}

function SidePanel() {
  const [state, setState] = useState<SidePanelState>({
    diffs: [],
    fullText: '',
    activeTabId: null,
  });

  // 监听 popup/content 发来的高亮数据
  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (msg?.type === 'sync-diffs') {
        setState({
          diffs: msg.diffs,
          fullText: msg.fullText,
          activeTabId: msg.tabId,
        });
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    // 初始化：尝试从 storage 恢复
    chrome.storage.local.get(['ps-last-diffs', 'ps-last-text', 'ps-active-tab'], (res) => {
      if (res['ps-last-diffs']) {
        setState({
          diffs: res['ps-last-diffs'],
          fullText: res['ps-last-text'] || '',
          activeTabId: res['ps-active-tab'] || null,
        });
      }
    });
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const saveState = (diffs: Diff[]) => {
    chrome.storage.local.set({
      'ps-last-diffs': diffs,
      'ps-last-text': state.fullText,
      'ps-active-tab': state.activeTabId,
    });
  };

  const handleAccept = (diff: Diff) => {
    const next = state.diffs.filter(d => d !== diff);
    setState({ ...state, diffs: next });
    saveState(next);
    if (state.activeTabId) {
      chrome.tabs.sendMessage(state.activeTabId, { type: 'remove-highlight', diff });
    }
  };

  const handleIgnore = (diff: Diff) => {
    const next = state.diffs.filter(d => d !== diff);
    setState({ ...state, diffs: next });
    saveState(next);
    if (state.activeTabId) {
      chrome.tabs.sendMessage(state.activeTabId, { type: 'remove-highlight', diff });
    }
  };

  const handleJump = (diff: Diff) => {
    if (state.activeTabId) {
      chrome.tabs.sendMessage(state.activeTabId, { type: 'jump-to', diff });
    }
  };

  const handleAcceptAll = () => {
    if (state.activeTabId) {
      chrome.tabs.sendMessage(state.activeTabId, { type: 'clear-highlights' });
    }
    setState({ ...state, diffs: [] });
    saveState([]);
  };

  const handleIgnoreAll = () => {
    if (state.activeTabId) {
      chrome.tabs.sendMessage(state.activeTabId, { type: 'clear-highlights' });
    }
    setState({ ...state, diffs: [] });
    saveState([]);
  };

  if (state.diffs.length === 0) {
    return (
      <div className="empty">
        <svg className="icon" viewBox="0 0 20 10" fill="none" aria-hidden="true">
          <path d="M1 6 q2.25 -4 4.5 0 q2.25 4 4.5 0 q2.25 -4 4.5 0 q2.25 4 4.5 0" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p>暂无错别字</p>
        <span className="hint">点击工具栏「校对当前页面」开始</span>
      </div>
    );
  }

  return (
    <div className="panel">
      <header className="panel-header">
        <h1>校对结果 <span className="count">{state.diffs.length} 处</span></h1>
        <div className="batch-actions">
          <button className="btn btn-secondary" onClick={handleAcceptAll}>全部采用</button>
          <button className="btn btn-danger" onClick={handleIgnoreAll}>全部忽略</button>
        </div>
      </header>
      <div className="diff-list">
        {state.diffs.map((diff, i) => (
          <DiffItem key={i} diff={diff} index={i}
            onAccept={handleAccept} onIgnore={handleIgnore} onJump={handleJump} />
        ))}
      </div>
    </div>
  );
}

// 挂载
const container = document.getElementById('root')!;
createRoot(container).render(<SidePanel />);