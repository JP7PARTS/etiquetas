import React, { useState, useEffect } from 'react';
import api from '../utils/api.js';
import { copyZPL } from '../utils/zpl.js';

const PAGE = 100;

function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function csvField(v) {
  const s = (v ?? '').toString();
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function saveCSV(content, filename) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function PrintHistory() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ geracoes: 0, etiquetas: 0 });
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState('todos');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [operator, setOperator] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [exporting, setExporting] = useState(false);

  function effectiveRange() {
    if (fromDate || toDate) return { from: fromDate || null, to: toDate || null };
    const today = new Date();
    if (preset === 'hoje') return { from: ymd(today), to: ymd(today) };
    if (preset === '7d') { const s = new Date(); s.setDate(s.getDate() - 6); return { from: ymd(s), to: ymd(today) }; }
    if (preset === '30d') { const s = new Date(); s.setDate(s.getDate() - 29); return { from: ymd(s), to: ymd(today) }; }
    return { from: null, to: null };
  }

  function filterParams() {
    const { from, to } = effectiveRange();
    const p = {};
    if (from) p.from = from;
    if (to) p.to = to;
    if (operator) p.operator = operator;
    return p;
  }

  useEffect(() => {
    api.get('/history/operators').then(r => setOperators(r.data)).catch(() => {});
  }, []);

  useEffect(() => { loadFirst(); /* eslint-disable-next-line */ }, [preset, fromDate, toDate, operator]);

  async function loadFirst() {
    setLoading(true); setError(''); setExpanded(null);
    try {
      const params = filterParams();
      const [list, sum] = await Promise.all([
        api.get('/history', { params: { ...params, limit: PAGE, offset: 0 } }),
        api.get('/history/summary', { params }),
      ]);
      setRows(list.data);
      setSummary(sum.data);
      setHasMore(list.data.length === PAGE);
    } catch (err) {
      setError('Erro ao carregar histórico: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await api.get('/history', { params: { ...filterParams(), limit: PAGE, offset: rows.length } });
      setRows(r => [...r, ...res.data]);
      setHasMore(res.data.length === PAGE);
    } catch (err) {
      setError('Erro ao carregar mais: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingMore(false);
    }
  }

  function setPresetClear(p) { setPreset(p); setFromDate(''); setToDate(''); }
  function fmtDate(s) { try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; } }

  async function recopy(rec) {
    setBusyId(rec.id);
    try {
      const res = await api.post('/labels/generate-batch', { items: rec.items });
      await copyZPL(res.data.zpl);
      setCopiedId(rec.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (err) {
      setError('Erro ao recopiar: ' + (err.response?.data?.error || err.message));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(rec) {
    if (!window.confirm(`Excluir este registro do histórico?\n\n${fmtDate(rec.created_at)} · ${rec.total_labels} etiqueta(s)\n\nEsta ação não pode ser desfeita.`)) return;
    setDeletingId(rec.id);
    try {
      await api.delete(`/history/${rec.id}`);
      setRows(l => l.filter(r => r.id !== rec.id));
      setSummary(s => ({ geracoes: Math.max(0, s.geracoes - 1), etiquetas: Math.max(0, s.etiquetas - (rec.total_labels || 0)) }));
    } catch (err) {
      setError('Erro ao excluir: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeletingId(null);
    }
  }

  async function exportCSV() {
    setExporting(true);
    try {
      const res = await api.get('/history', { params: { ...filterParams(), limit: 100000, offset: 0 } });
      const header = 'data_hora;operador;origem;sku;descricao;quantidade';
      const lines = [];
      for (const rec of res.data) {
        const when = fmtDate(rec.created_at);
        const orig = rec.origin === 'personalizado' ? 'Personalizado' : 'Lote';
        for (const it of (rec.items || [])) {
          lines.push([when, rec.user_email || '', orig, it.sku, it.descricao_curta || '', it.quantity].map(csvField).join(';'));
        }
      }
      saveCSV(header + '\n' + lines.join('\n') + '\n', `historico_${ymd(new Date())}.csv`);
    } catch (err) {
      setError('Erro ao exportar: ' + (err.response?.data?.error || err.message));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Histórico de gerações</h1>
        <p>Tudo que foi gerado em "Etiquetas produtos" e "Personalizado" — quem, quando e o que</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {/* Filtros: período + operador + exportar */}
        <div style={styles.filterBar}>
          <div style={styles.group}>
            {[['todos', 'Tudo'], ['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias']].map(([id, lbl]) => (
              <button key={id} type="button" onClick={() => setPresetClear(id)}
                style={{ ...styles.chip, ...(preset === id && !fromDate && !toDate ? styles.chipOn : {}) }}>{lbl}</button>
            ))}
          </div>
          <div style={styles.group}>
            <span style={styles.groupLabel}>De</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={styles.dateInput} />
            <span style={styles.groupLabel}>até</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={styles.dateInput} />
          </div>
        </div>
        <div style={styles.filterBar}>
          <div style={styles.group}>
            <span style={styles.groupLabel}>Operador</span>
            <select value={operator} onChange={e => setOperator(e.target.value)} style={styles.select}>
              <option value="">Todos</option>
              {operators.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          </div>
          <button className="btn-outline" onClick={exportCSV} disabled={exporting}>
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>

        {!loading && (
          <div style={styles.summary}>
            <div style={styles.summaryK}>No período selecionado</div>
            <div style={styles.summaryV}>
              {summary.geracoes} geraç{summary.geracoes !== 1 ? 'ões' : 'ão'} · <b>{summary.etiquetas}</b> etiqueta{summary.etiquetas !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>Carregando...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><p>Nenhuma geração registrada no período</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Data / hora</th>
                  <th>Operador</th>
                  <th>Itens</th>
                  <th style={{ textAlign: 'center' }}>Etiquetas</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(rec => {
                  const items = Array.isArray(rec.items) ? rec.items : [];
                  const single = items.length === 1 ? items[0] : null;
                  return (
                    <tr key={rec.id}>
                      <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(rec.created_at)}</td>
                      <td>{rec.user_email || '—'}</td>
                      <td>
                        {rec.origin === 'personalizado' && <span style={styles.custom}>✏️ Personalizado</span>}
                        {single ? (
                          <div style={styles.itemLine}>
                            <span style={styles.qty}>{single.quantity}×</span>
                            <code style={styles.code}>{single.sku}</code>
                            {single.descricao_curta && <span style={styles.itemDesc}>{single.descricao_curta}</span>}
                          </div>
                        ) : expanded === rec.id ? (
                          <div>
                            <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '12px', marginBottom: '6px' }}
                              onClick={() => setExpanded(null)}>Ocultar</button>
                            <div style={styles.subTableWrap}>
                              <table style={styles.subTable}>
                                <tbody>
                                  {items.map((it, i) => (
                                    <tr key={i} style={i % 2 ? styles.zebra : undefined}>
                                      <td style={styles.subQty}>{it.quantity}×</td>
                                      <td style={styles.subSku}><code style={styles.code}>{it.sku}</code></td>
                                      <td style={styles.subDesc}>{it.descricao_curta || ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => setExpanded(rec.id)}>{`Ver itens (${items.length})`}</button>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{rec.total_labels}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button className="btn-primary" style={styles.actBtn}
                            onClick={() => recopy(rec)} disabled={busyId === rec.id}>
                            {busyId === rec.id ? 'Copiando...' : copiedId === rec.id ? '✅ Copiado!' : 'Copiar'}
                          </button>
                          <button className="btn-danger" style={styles.actBtn}
                            onClick={() => remove(rec)} disabled={deletingId === rec.id} title="Excluir registro">
                            {deletingId === rec.id ? '...' : 'Excluir'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={styles.footer}>
              <span>{rows.length} de {summary.geracoes} registro{summary.geracoes !== 1 ? 's' : ''}</span>
              {hasMore && (
                <button className="btn-outline" style={{ padding: '5px 14px' }} onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Carregando...' : 'Carregar mais'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  filterBar: { display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  group: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  groupLabel: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 },
  chip: { padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'var(--btn-primary)', borderColor: 'var(--btn-primary)', color: '#fff' },
  dateInput: { padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px' },
  select: { padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px', minWidth: '160px' },
  summary: { padding: '12px 14px', background: '#f7fafc', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '14px' },
  summaryK: { fontSize: '12px', color: 'var(--text-muted)' },
  summaryV: { fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' },
  code: { background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12.5px', fontFamily: 'monospace', color: '#2b6cb0' },
  itemLine: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', whiteSpace: 'nowrap', padding: '2px 0' },
  qty: { fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: '30px' },
  itemDesc: { color: 'var(--text-secondary)', fontSize: '12.5px' },
  subTableWrap: { border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' },
  subTable: { width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' },
  zebra: { background: '#f7fafc' },
  subQty: { padding: '4px 10px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: 'none', width: '48px' },
  subSku: { padding: '4px 10px', whiteSpace: 'nowrap', borderBottom: 'none', width: '1%' },
  subDesc: { padding: '4px 10px', color: 'var(--text-secondary)', borderBottom: 'none' },
  custom: { display: 'inline-block', marginBottom: '4px', fontSize: '10.5px', fontWeight: 700, color: '#9a6a00', background: '#fff4e0', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' },
  actBtn: { padding: '4px 12px', fontSize: '12.5px', whiteSpace: 'nowrap', lineHeight: 1.2 },
  footer: { padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' },
};
