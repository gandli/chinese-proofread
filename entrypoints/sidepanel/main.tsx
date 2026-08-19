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
    <div className="diff-item bg-surface border border-border rounded-[10px] p-3 transition-[box-shadow,border-color] duration-150 hover:shadow-[0_4px_16px_rgba(15,23,42,0.08)] hover:border-[#cbd5e1]">
      <div className="diff-header flex items-center justify-between mb-1.5">
        <span className="diff-index text-xs font-semibold text-muted">#{index + 1}</span>
        <span className="diff-confidence text-[11px] text-success bg-success-bg px-1.5 py-0.5 rounded tabular-nums">
          {(diff.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <div className="diff-change text-sm leading-relaxed mb-2.5 flex items-center gap-1.5 flex-wrap">
        <del className="text-error line-through">{diff.original}</del>
        <span className="arrow text-[#94a3b8]">→</span>
        <strong className="text-success text-[15px]">{diff.corrected}</strong>
      </div>
      <div className="diff-actions flex gap-2">
        <button className="btn px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96] bg-success text-white hover:bg-[#065f46]" onClick={() => onAccept(diff)}>采用</button>
        <button className="btn px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96] bg-white text-[#475569] border-[#cbd5e1] hover:bg-[#f1f5f9] hover:border-[#94a3b8]" onClick={() => onIgnore(diff)}>忽略</button>
        <button className="btn px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96] bg-primary text-white hover:bg-primary-hover" onClick={() => onJump(diff)}>跳转</button>
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

  // 测试钩子：暴露 setState 给 E2E
  useEffect(() => {
    (window as any).__TEST__ = { setState: (s: Partial<SidePanelState>) => setState(prev => ({ ...prev, ...s })) };
    return () => { delete (window as any).__TEST__; };
  }, []);

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
    if (state.activeTabId != null) {
      chrome.tabs.sendMessage(state.activeTabId, { type: 'remove-highlight', diff });
    }
  };

  const handleIgnore = (diff: Diff) => {
    const next = state.diffs.filter(d => d !== diff);
    setState({ ...state, diffs: next });
    saveState(next);
    if (state.activeTabId != null) {
      chrome.tabs.sendMessage(state.activeTabId, { type: 'remove-highlight', diff });
    }
  };

  const handleJump = (diff: Diff) => {
    if (state.activeTabId != null) {
      chrome.tabs.sendMessage(state.activeTabId, { type: 'jump-to', diff });
    }
  };

  const handleAcceptAll = () => {
    if (state.activeTabId != null) {
      chrome.tabs.sendMessage(state.activeTabId, { type: 'clear-highlights' });
    }
    setState({ ...state, diffs: [] });
    saveState([]);
  };

  const handleIgnoreAll = () => {
    if (state.activeTabId != null) {
      chrome.tabs.sendMessage(state.activeTabId, { type: 'clear-highlights' });
    }
    setState({ ...state, diffs: [] });
    saveState([]);
  };

  if (state.diffs.length === 0) {
    return (
      <div className="empty flex-1 flex flex-col items-center justify-center text-[#94a3b8] text-center p-6">
        <svg className="icon w-12 h-6 mb-3" viewBox="0 0 20 10" fill="none" aria-hidden="true">
          <path d="M1 6 q2.25 -4 4.5 0 q2.25 4 4.5 0 q2.25 -4 4.5 0 q2.25 4 4.5 0" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-sm font-medium text-muted mb-1">暂无错别字</p>
        <span className="hint text-xs">点击工具栏「校对当前页面」开始</span>
      </div>
    );
  }

  return (
    <div className="panel h-screen flex flex-col bg-white overflow-hidden">
      <header className="panel-header flex items-center justify-between px-4 py-3.5 border-b border-border bg-surface shrink-0">
        <h1 className="text-[15px] font-semibold text-text">
          校对结果 <span className="count text-xs font-normal text-error bg-error-bg px-2 py-0.5 rounded-full ml-2">{state.diffs.length} 处</span>
        </h1>
        <div className="batch-actions flex gap-2">
          <button className="btn px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96] bg-[#e5e9f0] text-text hover:bg-[#cbd5e1]" onClick={handleAcceptAll}>全部采用</button>
          <button className="btn px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96] bg-error-bg text-error hover:bg-[#fecaca]" onClick={handleIgnoreAll}>全部忽略</button>
        </div>
      </header>
      <div className="diff-list flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
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
