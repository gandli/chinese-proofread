import { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./options.css";

interface CustomDictEntry {
  term: string;
  action: "ignore" | "correct";
  correctTo?: string;
  domains?: string[];
}

interface CustomDict {
  version: number;
  entries: CustomDictEntry[];
}

interface TestHook {
  setState: (s: Partial<CustomDict>) => void;
}

const DEFAULT_DOMAINS = [
  "tobacco",
  "medical",
  "legal",
  "finance",
  "tech",
] as const;

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const btnBase =
  "px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96]";

function Options() {
  const [dict, setDict] = useState<CustomDict>({ version: 1, entries: [] });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newEntry, setNewEntry] = useState<CustomDictEntry>({
    term: "",
    action: "ignore",
  });
  const [activeDomain, setActiveDomain] = useState<string>("all");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // 测试钩子：暴露 setState 给 E2E
  useEffect(() => {
    const testHook: TestHook = {
      setState: (s) => setDict((prev) => ({ ...prev, ...s })),
    };
    (window as unknown as { __TEST__?: TestHook }).__TEST__ = testHook;
    return () => {
      delete (window as unknown as { __TEST__?: TestHook }).__TEST__;
    };
  }, []);

  const loadDict = useCallback(async () => {
    try {
      const res = await fetch(chrome.runtime.getURL("custom-dict.json"));
      const data = await res.json();
      setDict(data);
    } catch (err) {
      showMessage("error", "加载词典失败: " + err);
    }
  }, []);

  // 加载词典
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadDict uses async/await, setDict called after await
    loadDict();
  }, [loadDict]);

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  function filteredEntries() {
    if (activeDomain === "all") return dict.entries;
    return dict.entries.filter((e) => e.domains?.includes(activeDomain));
  }

  function handleAdd() {
    if (!newEntry.term.trim()) return;
    const entries = [
      ...dict.entries,
      { ...newEntry, term: newEntry.term.trim() },
    ];
    setDict({ ...dict, entries });
    setNewEntry({ term: "", action: "ignore" });
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
    setNewEntry({ term: "", action: "ignore" });
    saveDict(entries);
  }

  function handleCancelEdit() {
    setEditingIndex(null);
    setNewEntry({ term: "", action: "ignore" });
  }

  function saveDict(entries: CustomDictEntry[]) {
    chrome.storage.local.set(
      { "ps-custom-dict": { version: 1, entries } },
      () => {
        showMessage("success", "保存成功");
      },
    );
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(dict, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom-dict.json";
    a.click();
    URL.revokeObjectURL(url);
    showMessage("success", "导出成功");
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
          showMessage("success", `导入 ${imported.entries.length} 条词条`);
        } else {
          showMessage("error", "格式错误：缺少 entries 数组");
        }
      } catch {
        showMessage("error", "JSON 解析失败");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleDomainChange(domain: string) {
    setActiveDomain(domain);
  }

  const inputCls =
    "flex-1 px-3 py-2 border border-border-subtle rounded-lg text-[13px] bg-white text-text transition-[border-color,box-shadow] duration-150 focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]";

  return (
    <div className="options max-w-[800px] mx-auto">
      <header className="mb-6 pb-4 border-b border-border">
        <h1 className="text-xl font-semibold text-text mb-1">
          中文校对助手 - 设置
        </h1>
        <p className="text-muted text-sm">行业专业词库管理</p>
      </header>

      {message && (
        <div
          className={cn(
            "toast fixed top-5 right-5 px-4 py-3 rounded-lg text-sm font-medium z-[9999]",
            message.type === "success"
              ? "bg-success-bg text-success border border-success-border"
              : "bg-error-bg text-error border border-error-border",
          )}
        >
          {message.text}
        </div>
      )}

      {/* 域过滤标签 */}
      <div className="flex gap-2 flex-wrap mb-6">
        {["all", ...DEFAULT_DOMAINS].map((d) => (
          <button
            key={d}
            className={cn(
              "tab px-3.5 py-1.5 border border-border-subtle rounded-full bg-white text-text-secondary text-xs font-medium cursor-pointer transition-colors duration-150 hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96]",
              activeDomain === d &&
                "bg-primary border-primary text-white hover:text-white hover:border-primary",
            )}
            onClick={() => handleDomainChange(d)}
          >
            {d === "all" ? "全部" : d}
          </button>
        ))}
      </div>

      {/* 新增/编辑表单 */}
      <div className="bg-white border border-border rounded-xl p-5 mb-5">
        <h2 className="text-[15px] font-semibold text-text mb-4 pb-3 border-b border-background-subtle">
          {editingIndex !== null ? "编辑词条" : "新增词条"}
        </h2>
        <div className="flex items-center gap-3 mb-3.5">
          <label className="w-20 text-[13px] text-muted font-medium shrink-0">
            词条
          </label>
          <input
            type="text"
            value={newEntry.term}
            onChange={(e) => setNewEntry({ ...newEntry, term: e.target.value })}
            placeholder="如：烟丝、焦油量、尼古丁"
            className={inputCls}
          />
        </div>
        <div className="flex items-center gap-3 mb-3.5">
          <label className="w-20 text-[13px] text-muted font-medium shrink-0">
            动作
          </label>
          <select
            value={newEntry.action}
            onChange={(e) =>
              setNewEntry({
                ...newEntry,
                action: e.target.value as "ignore" | "correct",
              })
            }
            className={inputCls}
          >
            <option value="ignore">忽略（不标记为错误）</option>
            <option value="correct">强制纠正为</option>
          </select>
        </div>
        {newEntry.action === "correct" && (
          <div className="flex items-center gap-3 mb-3.5">
            <label className="w-20 text-[13px] text-muted font-medium shrink-0">
              纠正为
            </label>
            <input
              type="text"
              value={newEntry.correctTo || ""}
              onChange={(e) =>
                setNewEntry({ ...newEntry, correctTo: e.target.value })
              }
              placeholder="目标词"
              className={inputCls}
            />
          </div>
        )}
        <div className="flex items-center gap-3 mb-3.5">
          <label className="w-20 text-[13px] text-muted font-medium shrink-0">
            所属域
          </label>
          <select
            multiple
            value={newEntry.domains || []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map(
                (o) => o.value,
              );
              setNewEntry({ ...newEntry, domains: selected });
            }}
            className={cn(inputCls, "min-h-20")}
          >
            {DEFAULT_DOMAINS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 mt-2">
          {editingIndex !== null ? (
            <>
              <button
                className={cn(
                  btnBase,
                  "bg-primary text-white hover:bg-primary-hover",
                )}
                onClick={handleSaveEdit}
              >
                保存
              </button>
              <button
                className={cn(
                  btnBase,
                  "bg-[#e5e9f0] text-text hover:bg-border-subtle",
                )}
                onClick={handleCancelEdit}
              >
                取消
              </button>
            </>
          ) : (
            <button
              className={cn(
                btnBase,
                "bg-primary text-white hover:bg-primary-hover",
              )}
              onClick={handleAdd}
            >
              添加
            </button>
          )}
        </div>
      </div>

      {/* 导入导出 */}
      <div className="bg-white border border-border rounded-xl p-5 mb-5">
        <h2 className="text-[15px] font-semibold text-text mb-4 pb-3 border-b border-background-subtle">
          导入 / 导出
        </h2>
        <div className="flex gap-3 flex-wrap">
          <button
            className={cn(
              btnBase,
              "bg-[#e5e9f0] text-text hover:bg-border-subtle",
            )}
            onClick={handleExport}
          >
            导出词典 (JSON)
          </button>
          <label className="file-input relative cursor-pointer">
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="absolute opacity-0 w-full h-full cursor-pointer"
            />
            <span className="inline-block px-4 py-2 border border-dashed border-border-subtle rounded-lg bg-surface text-text-secondary text-[13px] transition-all duration-150 hover:border-primary hover:bg-primary-soft hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              导入词典
            </span>
          </label>
        </div>
      </div>

      {/* 词条列表 */}
      <div className="list-card bg-white border border-border rounded-xl p-5">
        <h2 className="text-[15px] font-semibold text-text mb-4">
          词条列表 ({filteredEntries().length})
        </h2>
        {filteredEntries().length === 0 ? (
          <p className="text-[#94a3b8] text-center py-6">暂无词条</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="text-muted font-semibold bg-surface">词条</th>
                <th className="text-muted font-semibold bg-surface">动作</th>
                <th className="text-muted font-semibold bg-surface">纠正为</th>
                <th className="text-muted font-semibold bg-surface">域</th>
                <th className="text-muted font-semibold bg-surface">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries().map((entry, i) => (
                <tr key={i} className="hover:bg-surface">
                  <td>
                    <code>{entry.term}</code>
                  </td>
                  <td>
                    <span
                      className={cn(
                        "inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold",
                        entry.action === "ignore"
                          ? "bg-error-bg text-error"
                          : "bg-success-bg text-success",
                      )}
                    >
                      {entry.action === "ignore" ? "忽略" : "纠正"}
                    </span>
                  </td>
                  <td>{entry.correctTo || "—"}</td>
                  <td>
                    {entry.domains
                      ?.map((d) => (
                        <span
                          key={d}
                          className="inline-block px-1.5 py-0.5 mr-1 rounded bg-[#e5e9f0] text-muted text-[11px]"
                        >
                          {d}
                        </span>
                      ))
                      .join(" ") || "—"}
                  </td>
                  <td>
                    <button
                      className="btn-icon bg-none border-none cursor-pointer text-sm px-2.5 py-1.5 min-w-9 min-h-9 rounded-md transition-colors duration-150 hover:bg-background-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96]"
                      onClick={() => handleEdit(i)}
                      title="编辑"
                      aria-label="编辑"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button
                      className="btn-icon bg-none border-none cursor-pointer text-sm px-2.5 py-1.5 min-w-9 min-h-9 rounded-md transition-colors duration-150 hover:bg-error-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96] text-error"
                      onClick={() => handleDelete(i)}
                      title="删除"
                      aria-label="删除"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className="mt-6 pt-4 border-t border-border text-center">
        <p className="text-[#94a3b8] text-xs">
          词典修改实时生效，无需重启扩展。数据存储在浏览器本地，不上传云端。
        </p>
      </footer>
    </div>
  );
}

const container = document.getElementById("root")!;
createRoot(container).render(<Options />);
