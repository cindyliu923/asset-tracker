import { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, Area, AreaChart } from "recharts";

const CATEGORIES = [
  { key: "cash", label: "現金/活存", color: "#2dd4bf" },
  { key: "insurance", label: "保險", color: "#818cf8" },
  { key: "stock", label: "股票", color: "#f472b6" },
  { key: "etf", label: "ETF", color: "#fb923c" },
  { key: "fund", label: "基金", color: "#a3e635" },
];

const NON_CASH = CATEGORIES.filter(c => c.key !== "cash");

const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

const DEFAULT_CASH_ACCOUNTS = ["國泰", "玉山", "台新", "新光", "第一銀行"];

const fmt = (n) => {
  if (n === null || n === undefined || n === "") return "";
  return Number(n).toLocaleString("zh-TW");
};

const pct = (a, b) => {
  if (!b || b === 0) return "—";
  return ((a - b) / b * 100).toFixed(1) + "%";
};

const emptyYear = () => {
  const data = {};
  for (let m = 0; m < 12; m++) {
    data[m] = { cash: {} };
    NON_CASH.forEach(c => { data[m][c.key] = ""; });
  }
  return data;
};

// Handle legacy string format and new object format
const getCashTotal = (md) => {
  if (!md?.cash) return 0;
  if (typeof md.cash === "object") {
    return Object.values(md.cash).reduce((s, v) => s + (Number(v) || 0), 0);
  }
  return Number(md.cash) || 0;
};

const STORAGE_KEY = "asset-tracker-data";

export default function AssetTracker() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [allData, setAllData] = useState({});
  const [editMonth, setEditMonth] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [editCashAccounts, setEditCashAccounts] = useState([]);
  const [newBankInput, setNewBankInput] = useState("");
  const [showNewBankInput, setShowNewBankInput] = useState(false);
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("table");
  const [saving, setSaving] = useState(false);

  // Load
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/data');
        const json = await res.json();
        if (json.value) {
          setAllData(JSON.parse(json.value));
        }
      } catch { }
      setLoading(false);
    })();
  }, []);

  // Save
  const persist = useCallback(async (data) => {
    setSaving(true);
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(data) }),
      });
    } catch (e) { console.error(e); }
    setSaving(false);
  }, []);

  const cashAccounts = useMemo(
    () => allData.cashAccounts || DEFAULT_CASH_ACCOUNTS,
    [allData.cashAccounts]
  );

  const yearData = useMemo(() => allData[year] || emptyYear(), [allData, year]);

  const monthTotal = useCallback((m) => {
    const md = yearData[m];
    if (!md) return 0;
    return getCashTotal(md) + NON_CASH.reduce((s, c) => s + (Number(md[c.key]) || 0), 0);
  }, [yearData]);

  const chartData = useMemo(() => {
    return MONTHS.map((label, i) => {
      const md = yearData[i] || {};
      const entry = { name: label };
      let total = 0;
      CATEGORIES.forEach(c => {
        const v = c.key === "cash" ? getCashTotal(md) : (Number(md[c.key]) || 0);
        entry[c.key] = v || null;
        total += v;
      });
      entry.total = total || null;
      return entry;
    });
  }, [yearData]);

  const pieData = useMemo(() => {
    for (let i = 11; i >= 0; i--) {
      if (monthTotal(i) > 0) {
        return CATEGORIES.map(c => ({
          name: c.label,
          value: c.key === "cash" ? getCashTotal(yearData[i]) : (Number(yearData[i]?.[c.key]) || 0),
          color: c.color,
        })).filter(d => d.value > 0);
      }
    }
    return [];
  }, [yearData, monthTotal]);

  const latestMonthLabel = useMemo(() => {
    for (let i = 11; i >= 0; i--) if (monthTotal(i) > 0) return MONTHS[i];
    return null;
  }, [monthTotal]);

  const annualGrowth = useMemo(() => {
    let first = -1, last = -1;
    for (let i = 0; i < 12; i++) if (monthTotal(i) > 0) { first = i; break; }
    for (let i = 11; i >= 0; i--) if (monthTotal(i) > 0) { last = i; break; }
    if (first === -1 || first === last) return null;
    return { from: MONTHS[first], to: MONTHS[last], pct: pct(monthTotal(last), monthTotal(first)) };
  }, [monthTotal]);

  const getPrevMonthData = useCallback((m) => {
    if (m > 0) return yearData[m - 1];
    return allData[year - 1]?.[11] ?? null;
  }, [yearData, allData, year]);

  const openEdit = (m) => {
    const md = yearData[m] || {};
    const prevMd = getPrevMonthData(m) || {};
    const accounts = allData.cashAccounts || DEFAULT_CASH_ACCOUNTS;

    const currentHasData = getCashTotal(md) > 0 || NON_CASH.some(c => Number(md[c.key]) > 0);
    const prevHasData = getCashTotal(prevMd) > 0 || NON_CASH.some(c => Number(prevMd[c.key]) > 0);
    const autoFill = !currentHasData && prevHasData;

    const sourceMd = autoFill ? prevMd : md;
    const sourceCash = typeof sourceMd.cash === "object" ? sourceMd.cash : {};

    const vals = { cash: {} };
    accounts.forEach(bank => { vals.cash[bank] = sourceCash[bank] ?? ""; });
    NON_CASH.forEach(c => { vals[c.key] = sourceMd[c.key] ?? ""; });

    setIsAutoFilled(autoFill);
    setEditCashAccounts([...accounts]);
    setEditValues(vals);
    setEditMonth(m);
    setShowNewBankInput(false);
    setNewBankInput("");
  };

  const saveEdit = async () => {
    const updated = { ...allData };
    if (!updated[year]) updated[year] = emptyYear();
    updated.cashAccounts = editCashAccounts;
    updated[year][editMonth] = { ...editValues };
    setAllData(updated);
    setEditMonth(null);
    await persist(updated);
  };

  const clearMonth = async (m) => {
    const updated = { ...allData };
    if (updated[year]) {
      updated[year][m] = { cash: {} };
      NON_CASH.forEach(c => { updated[year][m][c.key] = ""; });
      setAllData(updated);
      await persist(updated);
    }
  };

  const resetAll = async () => {
    if (!confirm("確定要清除所有資料嗎？此操作無法復原。")) return;
    setAllData({});
    try { await fetch('/api/data', { method: 'DELETE' }); } catch {}
  };

  const addBank = () => {
    const name = newBankInput.trim();
    if (!name || editCashAccounts.includes(name)) return;
    setEditCashAccounts(prev => [...prev, name]);
    setEditValues(prev => ({ ...prev, cash: { ...prev.cash, [name]: "" } }));
    setNewBankInput("");
    setShowNewBankInput(false);
  };

  const removeBank = (name) => {
    setEditCashAccounts(prev => prev.filter(b => b !== name));
    setEditValues(prev => {
      const cash = { ...prev.cash };
      delete cash[name];
      return { ...prev, cash };
    });
  };

  const editTotal = useMemo(() => {
    const cashSum = Object.values(editValues.cash || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    return cashSum + NON_CASH.reduce((s, c) => s + (Number(editValues[c.key]) || 0), 0);
  }, [editValues]);

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingDot} />
        <p style={{ color: "#94a3b8", fontFamily: "'Noto Sans TC', sans-serif" }}>載入中...</p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.title}>資產月報</h1>
            <p style={styles.subtitle}>簡化版滿月記帳 — 每月記錄，掌握趨勢</p>
          </div>
          {saving && <span style={styles.savingBadge}>儲存中...</span>}
        </div>
      </header>

      <div style={styles.container}>
        <div style={styles.toolbar}>
          <div style={styles.yearSelector}>
            <button style={styles.yearBtn} onClick={() => setYear(y => y - 1)}>◀</button>
            <span style={styles.yearLabel}>{year} 年</span>
            <button style={styles.yearBtn} onClick={() => setYear(y => y + 1)}>▶</button>
          </div>
          <div style={styles.viewToggle}>
            <button style={{...styles.toggleBtn, ...(view === "table" ? styles.toggleActive : {})}} onClick={() => setView("table")}>表格</button>
            <button style={{...styles.toggleBtn, ...(view === "chart" ? styles.toggleActive : {})}} onClick={() => setView("chart")}>圖表</button>
          </div>
        </div>

        <div style={styles.summaryRow}>
          {annualGrowth && (
            <div style={styles.summaryCard}>
              <div style={styles.summaryLabel}>年度成長</div>
              <div style={{...styles.summaryValue, color: annualGrowth.pct.startsWith("-") ? "#f87171" : "#2dd4bf"}}>{annualGrowth.pct}</div>
              <div style={styles.summaryMeta}>{annualGrowth.from} → {annualGrowth.to}</div>
            </div>
          )}
          {latestMonthLabel && (
            <div style={styles.summaryCard}>
              <div style={styles.summaryLabel}>最新總資產（{latestMonthLabel}）</div>
              <div style={styles.summaryValue}>
                ${fmt((() => { for (let i = 11; i >= 0; i--) { if (monthTotal(i) > 0) return monthTotal(i); } return 0; })())}
              </div>
            </div>
          )}
        </div>

        {view === "table" ? (
          <div style={styles.monthGrid}>
            {MONTHS.map((label, i) => {
              const total = monthTotal(i);
              const prevTotal = i > 0 ? monthTotal(i - 1) : 0;
              const growth = i > 0 && prevTotal > 0 ? pct(total, prevTotal) : null;
              const hasData = total > 0;
              const cashMd = yearData[i]?.cash;
              return (
                <div key={i} style={{...styles.monthCard, ...(hasData ? styles.monthCardFilled : {})}} onClick={() => openEdit(i)}>
                  <div style={styles.monthCardHeader}>
                    <span style={styles.monthLabel}>{label}</span>
                    {growth && (
                      <span style={{...styles.growthBadge, color: growth.startsWith("-") ? "#f87171" : "#2dd4bf"}}>
                        {growth}
                      </span>
                    )}
                  </div>
                  {hasData ? (
                    <>
                      <div style={styles.monthTotal}>${fmt(total)}</div>
                      <div style={styles.monthBreakdown}>
                        {CATEGORIES.map(c => {
                          if (c.key === "cash") {
                            const cashTotal = getCashTotal(yearData[i]);
                            if (!cashTotal) return null;
                            return (
                              <div key="cash">
                                <div style={styles.breakdownItem}>
                                  <span style={{...styles.dot, backgroundColor: c.color}} />
                                  <span style={styles.breakdownLabel}>{c.label}</span>
                                  <span style={styles.breakdownValue}>${fmt(cashTotal)}</span>
                                </div>
                                {typeof cashMd === "object" && cashAccounts.map(bank => {
                                  const v = Number(cashMd[bank]) || 0;
                                  if (!v) return null;
                                  return (
                                    <div key={bank} style={styles.breakdownSubItem}>
                                      <span style={styles.breakdownSubLabel}>{bank}</span>
                                      <span style={styles.breakdownValue}>${fmt(v)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }
                          const v = Number(yearData[i]?.[c.key]) || 0;
                          if (!v) return null;
                          return (
                            <div key={c.key} style={styles.breakdownItem}>
                              <span style={{...styles.dot, backgroundColor: c.color}} />
                              <span style={styles.breakdownLabel}>{c.label}</span>
                              <span style={styles.breakdownValue}>${fmt(v)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div style={styles.emptyMonth}>點擊填寫</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={styles.chartSection}>
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>總資產趨勢</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 10000 ? (v/10000).toFixed(0) + "萬" : fmt(v)} width={50} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0", fontFamily: "'Noto Sans TC', sans-serif", fontSize: 13 }} formatter={(v) => ["$" + fmt(v), "總資產"]} />
                  <Area type="monotone" dataKey="total" stroke="#2dd4bf" strokeWidth={2.5} fill="url(#totalGrad)" connectNulls dot={{ r: 4, fill: "#2dd4bf" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>各項資產趨勢</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 10000 ? (v/10000).toFixed(0) + "萬" : fmt(v)} width={50} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0", fontFamily: "'Noto Sans TC', sans-serif", fontSize: 13 }} formatter={(v, name) => ["$" + fmt(v), CATEGORIES.find(c => c.key === name)?.label || name]} />
                  {CATEGORIES.map(c => (
                    <Line key={c.key} type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={2} connectNulls dot={{ r: 3, fill: c.color }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <div style={styles.legendRow}>
                {CATEGORIES.map(c => (
                  <span key={c.key} style={styles.legendItem}>
                    <span style={{...styles.dot, backgroundColor: c.color}} />
                    {c.label}
                  </span>
                ))}
              </div>
            </div>

            {pieData.length > 0 && (
              <div style={styles.chartCard}>
                <h3 style={styles.chartTitle}>資產配置（{latestMonthLabel}）</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3} strokeWidth={0}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0", fontFamily: "'Noto Sans TC', sans-serif", fontSize: 13 }} formatter={(v) => "$" + fmt(v)} />
                    <Legend formatter={(value) => <span style={{ color: "#cbd5e1", fontSize: 13 }}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        <div style={styles.footerActions}>
          <button style={styles.resetBtn} onClick={resetAll}>清除所有資料</button>
        </div>
      </div>

      {/* Edit Modal */}
      {editMonth !== null && (
        <div style={styles.overlay} onClick={() => setEditMonth(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{year} 年 {MONTHS[editMonth]}</h2>
            {isAutoFilled ? (
              <p style={styles.autoFillNote}>已自動帶入上個月數值，請確認後儲存</p>
            ) : (
              <p style={styles.modalHint}>填入該月底各項資產的市值（新台幣）</p>
            )}

            {/* Cash section with bank breakdown */}
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>
                <span style={{...styles.dot, backgroundColor: "#2dd4bf"}} />
                現金/活存
              </label>
              {editCashAccounts.map(bank => (
                <div key={bank} style={styles.bankBlock}>
                  <div style={styles.bankHeader}>
                    <span style={styles.bankName}>{bank}</span>
                    <button style={styles.removeBankBtn} onClick={() => removeBank(bank)}>×</button>
                  </div>
                  <div style={styles.inputWrap}>
                    <span style={styles.inputPrefix}>$</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      style={styles.input}
                      placeholder="0"
                      value={editValues.cash?.[bank] ?? ""}
                      onChange={e => setEditValues(v => ({ ...v, cash: { ...v.cash, [bank]: e.target.value } }))}
                      onFocus={e => e.target.select()}
                    />
                  </div>
                </div>
              ))}
              {showNewBankInput ? (
                <div style={styles.addBankRow}>
                  <input
                    style={styles.bankNameInput}
                    placeholder="銀行名稱"
                    value={newBankInput}
                    onChange={e => setNewBankInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addBank(); if (e.key === "Escape") { setShowNewBankInput(false); setNewBankInput(""); } }}
                    autoFocus
                  />
                  <button style={styles.addBankConfirmBtn} onClick={addBank}>新增</button>
                  <button style={styles.cancelSmallBtn} onClick={() => { setShowNewBankInput(false); setNewBankInput(""); }}>取消</button>
                </div>
              ) : (
                <button style={styles.addBankBtn} onClick={() => setShowNewBankInput(true)}>＋ 新增銀行</button>
              )}
            </div>

            {/* Other categories */}
            {NON_CASH.map(c => (
              <div key={c.key} style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>
                  <span style={{...styles.dot, backgroundColor: c.color}} />
                  {c.label}
                </label>
                <div style={styles.inputWrap}>
                  <span style={styles.inputPrefix}>$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    style={styles.input}
                    placeholder="0"
                    value={editValues[c.key]}
                    onChange={e => setEditValues(v => ({...v, [c.key]: e.target.value}))}
                    onFocus={e => e.target.select()}
                  />
                </div>
              </div>
            ))}

            <div style={styles.modalTotal}>
              合計：<strong>${fmt(editTotal)}</strong>
            </div>
            <div style={styles.modalActions}>
              <button style={styles.cancelBtn} onClick={() => setEditMonth(null)}>取消</button>
              <button style={styles.clearMonthBtn} onClick={() => { clearMonth(editMonth); setEditMonth(null); }}>清除本月</button>
              <button style={styles.saveBtn} onClick={saveEdit}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
    fontFamily: "'Noto Sans TC', sans-serif",
    color: "#e2e8f0",
    paddingBottom: 40,
  },
  loadingWrap: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    gap: 16,
  },
  loadingDot: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "3px solid #334155",
    borderTopColor: "#2dd4bf",
    animation: "spin 0.8s linear infinite",
  },
  header: {
    background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
    borderBottom: "1px solid #1e3a5f",
    padding: "28px 20px 22px",
  },
  headerInner: {
    maxWidth: 900,
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    margin: 0,
    letterSpacing: 2,
    background: "linear-gradient(90deg, #2dd4bf, #818cf8)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
    fontWeight: 300,
  },
  savingBadge: {
    fontSize: 11,
    color: "#94a3b8",
    background: "#1e293b",
    padding: "4px 10px",
    borderRadius: 20,
    border: "1px solid #334155",
  },
  container: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "0 16px",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    margin: "20px 0 16px",
    flexWrap: "wrap",
    gap: 12,
  },
  yearSelector: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  yearBtn: {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#94a3b8",
    width: 36,
    height: 36,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Noto Sans TC', sans-serif",
  },
  yearLabel: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: 1,
    fontFamily: "'JetBrains Mono', monospace",
    color: "#e2e8f0",
  },
  viewToggle: {
    display: "flex",
    background: "#1e293b",
    borderRadius: 10,
    border: "1px solid #334155",
    overflow: "hidden",
  },
  toggleBtn: {
    padding: "8px 18px",
    border: "none",
    background: "transparent",
    color: "#64748b",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'Noto Sans TC', sans-serif",
    transition: "all 0.2s",
  },
  toggleActive: {
    background: "#334155",
    color: "#2dd4bf",
  },
  summaryRow: {
    display: "flex",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  summaryCard: {
    flex: "1 1 200px",
    background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
    border: "1px solid #334155",
    borderRadius: 14,
    padding: "18px 20px",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 6,
    fontWeight: 400,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    color: "#e2e8f0",
  },
  summaryMeta: {
    fontSize: 11,
    color: "#475569",
    marginTop: 4,
  },
  monthGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 12,
  },
  monthCard: {
    background: "#1e293b",
    border: "1px solid #2a3a50",
    borderRadius: 14,
    padding: "16px 18px",
    cursor: "pointer",
    transition: "all 0.2s",
    minHeight: 90,
  },
  monthCardFilled: {
    borderColor: "#334155",
    background: "linear-gradient(135deg, #1e293b 0%, #172033 100%)",
  },
  monthCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: "#94a3b8",
  },
  growthBadge: {
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "'JetBrains Mono', monospace",
  },
  monthTotal: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    color: "#e2e8f0",
    marginBottom: 10,
  },
  monthBreakdown: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  breakdownItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
  },
  breakdownSubItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    paddingLeft: 14,
    marginTop: 2,
  },
  breakdownLabel: {
    color: "#94a3b8",
    flex: 1,
  },
  breakdownSubLabel: {
    color: "#64748b",
    flex: 1,
  },
  breakdownValue: {
    color: "#cbd5e1",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
    flexShrink: 0,
  },
  emptyMonth: {
    color: "#475569",
    fontSize: 13,
    marginTop: 8,
  },
  chartSection: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  chartCard: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 14,
    padding: "20px 16px",
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: "#94a3b8",
    margin: "0 0 16px 4px",
  },
  legendRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 12,
    paddingLeft: 4,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "#94a3b8",
  },
  footerActions: {
    marginTop: 32,
    textAlign: "center",
  },
  resetBtn: {
    background: "transparent",
    border: "1px solid #334155",
    color: "#64748b",
    padding: "8px 20px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "'Noto Sans TC', sans-serif",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 16,
  },
  modal: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 18,
    padding: "28px 24px",
    width: "100%",
    maxWidth: 380,
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 700,
    margin: "0 0 4px",
    color: "#e2e8f0",
  },
  modalHint: {
    fontSize: 12,
    color: "#64748b",
    margin: "0 0 20px",
  },
  autoFillNote: {
    fontSize: 12,
    color: "#2dd4bf",
    margin: "0 0 20px",
    opacity: 0.85,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 500,
    color: "#94a3b8",
    marginBottom: 6,
  },
  // Bank sub-fields
  bankBlock: {
    marginBottom: 8,
  },
  bankHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  bankName: {
    fontSize: 12,
    color: "#64748b",
    paddingLeft: 2,
  },
  removeBankBtn: {
    background: "transparent",
    border: "none",
    color: "#475569",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    padding: "0 2px",
    fontFamily: "sans-serif",
  },
  addBankBtn: {
    background: "transparent",
    border: "1px dashed #334155",
    color: "#475569",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'Noto Sans TC', sans-serif",
    width: "100%",
    marginTop: 4,
  },
  addBankRow: {
    display: "flex",
    gap: 6,
    marginTop: 6,
  },
  bankNameInput: {
    flex: 1,
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "8px 10px",
    color: "#e2e8f0",
    fontSize: 13,
    outline: "none",
    fontFamily: "'Noto Sans TC', sans-serif",
  },
  addBankConfirmBtn: {
    background: "#2dd4bf22",
    border: "1px solid #2dd4bf55",
    color: "#2dd4bf",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'Noto Sans TC', sans-serif",
    whiteSpace: "nowrap",
  },
  cancelSmallBtn: {
    background: "transparent",
    border: "1px solid #334155",
    color: "#64748b",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'Noto Sans TC', sans-serif",
    whiteSpace: "nowrap",
  },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 10,
    overflow: "hidden",
  },
  inputPrefix: {
    padding: "0 0 0 14px",
    color: "#475569",
    fontSize: 15,
    fontFamily: "'JetBrains Mono', monospace",
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#e2e8f0",
    fontSize: 16,
    padding: "12px 14px 12px 6px",
    fontFamily: "'JetBrains Mono', monospace",
    width: "100%",
  },
  modalTotal: {
    fontSize: 15,
    color: "#94a3b8",
    borderTop: "1px solid #334155",
    paddingTop: 14,
    marginTop: 6,
    fontFamily: "'JetBrains Mono', monospace",
  },
  modalActions: {
    display: "flex",
    gap: 8,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    padding: "12px 0",
    borderRadius: 10,
    border: "1px solid #334155",
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "'Noto Sans TC', sans-serif",
  },
  clearMonthBtn: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #ef4444",
    background: "transparent",
    color: "#f87171",
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "'Noto Sans TC', sans-serif",
  },
  saveBtn: {
    flex: 1.5,
    padding: "12px 0",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #2dd4bf, #818cf8)",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "'Noto Sans TC', sans-serif",
  },
};
