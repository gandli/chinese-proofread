import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './options.css';

interface CustomDictEntry {
  term: string;
  action: 'ignore' | 'correct';
  correctTo?: string;
  domains?: string[];
}

interface CustomDict {
  version: number;
  entries: CustomDictEntry[];
}

const DEFAULT_DOMAINS = ['tobacco', 'medical', 'legal', 'finance', 'tech'];

function Options() {
  const [dict, setDict] = useState<CustomDict>({ version: 1, entries: [] });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newEntry, setNewEntry] = useState<CustomDictEntry>({ term: '', action: 'ignore' });
  const [activeDomain, setActiveDomain] = useState<string>('all');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 测试钩子：暴露 setState 给 E2E
  useEffect(() => {
    (window as any).__TEST__ = { setState: (s: Partial<CustomDict>) => setDict(prev => ({ ...prev, ...s })) };
    return () => { delete (window as any).__TEST__; };
  }, []);

  async function loadDict() {
    try {
      const res = await fetch(chrome.runtime.getURL('custom-dict.json'));
      const data = await res.json();
      setDict(data);
    } catch (err) {
      showMessage('error', '加载词典失败: ' + err);
    }
  }

  // 加载词典
  useEffect(() => {
    loadDict();
  }, []);

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  function filteredEntries() {
    if (activeDomain === 'all') return dict.entries;
    return dict.entries.filter(e => e.domains?.includes(activeDomain));
  }

  function handleAdd() {
    if (!newEntry.term.trim()) return;
    const entries = [...dict.entries, { ...newEntry, term: newEntry.term.trim() }];
    setDict({ ...dict, entries });
    setNewEntry({ term: '', action: 'ignore' });
    saveDict(entries);
  }

  function handleDelete(index: number) {
    const entry = dict.entries[index];
    if (!window.confirm(`确定删除词条「${entry.term}」？`)) return;
    const entries = dict.entries.filter((_, i) => i !== index);
    setDict({ ...dict, entries });
    saveDict(entries);
  }

  function handleEdit(index: number) {
    setEditingIndex(index);
    setNewEntry({ ...dict.entries[index] });
  }

  function handleSaveEdit() {
    if (editingIndex === null || !newEntry.term.trim()) return;
    const entries = [...dict.entries];
    entries[editingIndex] = { ...newEntry, term: newEntry.term.trim() };
    setDict({ ...dict, entries });
    setEditingIndex(null);
    setNewEntry({ term: '', action: 'ignore' });
    saveDict(entries);
  }

  function handleCancelEdit() {
    setEditingIndex(null);
    setNewEntry({ term: '', action: 'ignore' });
  }

  function saveDict(entries: CustomDictEntry[]) {
    chrome.storage.local.set({ 'ps-custom-dict': { version: 1, entries } }, () => {
      showMessage('success', '保存成功');
    });
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(dict, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom-dict.json';
    a.click();
    URL.revokeObjectURL(url);
    showMessage('success', '导出成功');
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (imported.entries && Array.isArray(imported.entries)) {
          setDict(imported);
          saveDict(imported.entries);
          showMessage('success', `导入 ${imported.entries.length} 条词条`);
        } else {
          showMessage('error', '格式错误：缺少 entries 数组');
        }
      } catch {
        showMessage('error', 'JSON 解析失败');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleDomainChange(domain: string) {
    setActiveDomain(domain);
  }

  return (
    <div className="options">
      <header className="header">
        <h1>中文校对助手 - 设置</h1>
        <p className="subtitle">行业专业词库管理</p>
      </header>

      {message && <div className={`toast ${message.type}`}>{message.text}</div>}

      {/* 域过滤标签 */}
      <div className="domain-tabs">
        {['all', ...DEFAULT_DOMAINS].map(d => (
          <button
            key={d}
            className={`tab ${activeDomain === d ? 'active' : ''}`}
            onClick={() => handleDomainChange(d)}
          >
            {d === 'all' ? '全部' : d}
          </button>
        ))}
      </div>

      {/* 新增/编辑表单 */}
      <div className="form-card">
        <h2>{editingIndex !== null ? '编辑词条' : '新增词条'}</h2>
        <div className="form-row">
          <label>词条</label>
          <input
            type="text"
            value={newEntry.term}
            onChange={e => setNewEntry({ ...newEntry, term: e.target.value })}
            placeholder="如：烟丝、焦油量、尼古丁"
          />
        </div>
        <div className="form-row">
          <label>动作</label>
          <select
            value={newEntry.action}
            onChange={e => setNewEntry({ ...newEntry, action: e.target.value as 'ignore' | 'correct' })}
          >
            <option value="ignore">忽略（不标记为错误）</option>
            <option value="correct">强制纠正为</option>
          </select>
        </div>
        {newEntry.action === 'correct' && (
          <div className="form-row">
            <label>纠正为</label>
            <input
              type="text"
              value={newEntry.correctTo || ''}
              onChange={e => setNewEntry({ ...newEntry, correctTo: e.target.value })}
              placeholder="目标词"
            />
          </div>
        )}
        <div className="form-row">
          <label>所属域</label>
          <select
            multiple
            value={newEntry.domains || []}
            onChange={e => {
              const selected = Array.from(e.target.selectedOptions).map(o => o.value);
              setNewEntry({ ...newEntry, domains: selected });
            }}
          >
            {DEFAULT_DOMAINS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="form-actions">
          {editingIndex !== null ? (
            <>
              <button className="btn btn-primary" onClick={handleSaveEdit}>保存</button>
              <button className="btn btn-secondary" onClick={handleCancelEdit}>取消</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={handleAdd}>添加</button>
          )}
        </div>
      </div>

      {/* 导入导出 */}
      <div className="form-card">
        <h2>导入 / 导出</h2>
        <div className="import-export">
          <button className="btn btn-secondary" onClick={handleExport}>导出词典 (JSON)</button>
          <label className="file-input">
            <input type="file" accept=".json" onChange={handleImport} />
            <span>导入词典</span>
          </label>
        </div>
      </div>

      {/* 词条列表 */}
      <div className="list-card">
        <h2>词条列表 ({filteredEntries().length})</h2>
        {filteredEntries().length === 0 ? (
          <p className="empty">暂无词条</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>词条</th>
                <th>动作</th>
                <th>纠正为</th>
                <th>域</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries().map((entry, i) => (
                <tr key={i}>
                  <td><code>{entry.term}</code></td>
                  <td>
                    <span className={`badge ${entry.action}`}>
                      {entry.action === 'ignore' ? '忽略' : '纠正'}
                    </span>
                  </td>
                  <td>{entry.correctTo || '—'}</td>
                  <td>
                    {entry.domains?.map(d => (
                      <span key={d} className="domain-tag">{d}</span>
                    )).join(' ') || '—'}
                  </td>
                  <td>
                    <button className="btn-icon" onClick={() => handleEdit(i)} title="编辑" aria-label="编辑">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button className="btn-icon btn-danger" onClick={() => handleDelete(i)} title="删除" aria-label="删除">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className="footer">
        <p>词典修改实时生效，无需重启扩展。数据存储在浏览器本地，不上传云端。</p>
      </footer>
    </div>
  );
}

const container = document.getElementById('root')!;
createRoot(container).render(<Options />);