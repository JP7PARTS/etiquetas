import React, { useState, useEffect } from 'react';
import api from '../utils/api.js';
import { copyZPL } from '../utils/zpl.js';

export default function PrintHistory() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState('todos'); // todos | hoje | 7d | 30d
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await api.get('/history');
      setList(res.data);
    } catch (err) {
      setError('Erro ao carregar histórico: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  function fmtDate(s) {
    try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; }
  }

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

  function periodRange() {
    if (fromDate || toDate) {
      return {
        start: fromDate ? new Date(fromDate + 'T00:00:00') : null,
        end: toDate ? new Date(toDate + 'T23:59:59.999') : null,
      };
    }
    const now = Date.now();
    if (preset === 'hoje') { const s = new Date(); s.setHours(0, 0, 0, 0); return { start: s, end: null }; }
    if (preset === '7d') return { start: new Date(now - 7 * 864e5), end: null };
    if (preset === '30d') return { start: new Date(now - 30 * 864e5), end: null };
    return { start: null, end: null };
  }

  function setPresetClear(p) { setPreset(p); setFromDate(''); setToDate(''); }

  async function remove(rec) {
    const when = fmtDate(rec.created_at);
    if (!window.confirm(`Excluir este registro do histórico?\n\n${when} · ${rec.total_labels} etiqueta(s)\n\nEsta ação não pode ser desfeita.`)) return;
    setDeletingId(rec.id);
    try {
      await api.delete(`/history/${rec.id}`);
      setList(l => l.filter(r => r.id !== rec.id));
    } catch (err) {
      setError('Erro ao excluir: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeletingId(null);
    }
  }

  const q = search.trim().toLowerCase();
  const range = periodRange();
  const filtered = list.filter(r => {
    const d = new Date(r.created_at);
    if (range.start && d < range.start) return false;
    if (range.end && d > range.end) return false;
    if (!q) return true;
    return (r.user_email || '').toLowerCase().includes(q) ||
      (Array.isArray(r.items) && r.items.some(it => (it.sku || '').toLowerCase().includes(q)));
  });
  const totalEtiquetas = filtered.reduce((s, r) => s + (r.total_labels || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1>Histórico de gerações</h1>
        <p>Tudo que foi gerado em "Etiquetas produtos" — quem, quando e o que</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div style={styles.toolbar}>
          <div style={styles.searchWrapper}>
            <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por operador ou SKU..." style={{ paddingLeft: '34px' }} />
          </div>
          <button className="btn-outline" onClick={load}>Atualizar</button>
        </div>

        {/* Filtro de período */}
        <div style={styles.periodBar}>
          <div style={styles.presets}>
            {[['todos', 'Tudo'], ['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias']].map(([id, lbl]) => (
              <button key={id} type="button" onClick={() => setPresetClear(id)}
                style={{ ...styles.presetChip, ...(preset === id && !fromDate && !toDate ? styles.presetActive : {}) }}>
                {lbl}
              </button>
            ))}
          </div>
          <div style={styles.dateRange}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>De</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={styles.dateInput} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>até</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={styles.dateInput} />
          </div>
        </div>

        {/* Resumo do período */}
        {!loading && (
          <div style={styles.summary}>
            <div>
              <div style={styles.summaryK}>No período selecionado</div>
              <div style={styles.summaryV}>
                {filtered.length} geraç{filtered.length !== 1 ? 'ões' : 'ão'} · <b>{totalEtiquetas}</b> etiqueta{totalEtiquetas !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>Carregando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>{search ? 'Nada encontrado' : 'Nenhuma geração registrada ainda'}</p></div>
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
                {filtered.map(rec => {
                  const items = Array.isArray(rec.items) ? rec.items : [];
                  const single = items.length === 1 ? items[0] : null;
                  return (
                  <React.Fragment key={rec.id}>
                    <tr>
                      <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(rec.created_at)}</td>
                      <td>
                        {rec.user_email || '—'}
                        {rec.origin === 'personalizado' && <span style={styles.custom}>✏️ Personalizado</span>}
                      </td>
                      <td>
                        {single ? (
                          <div style={styles.itemRowInline}>
                            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{single.quantity}×</span>
                            <code style={styles.code}>{single.sku}</code>
                            {single.descricao_curta && <span style={{ color: 'var(--text-secondary)', fontSize: '12.5px' }}>{single.descricao_curta}</span>}
                          </div>
                        ) : (
                          <button className="btn-outline" style={{ padding: '5px 10px' }}
                            onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}>
                            {expanded === rec.id ? 'Ocultar' : `Ver itens (${items.length})`}
                          </button>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{rec.total_labels}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button className="btn-primary" style={{ padding: '5px 10px' }}
                            onClick={() => recopy(rec)} disabled={busyId === rec.id}>
                            {busyId === rec.id ? 'Copiando...' : copiedId === rec.id ? '✅ Copiado!' : 'Copiar de novo'}
                          </button>
                          <button className="btn-danger" style={{ padding: '5px 10px' }}
                            onClick={() => remove(rec)} disabled={deletingId === rec.id} title="Excluir registro">
                            {deletingId === rec.id ? '...' : 'Excluir'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {!single && expanded === rec.id && (
                      <tr>
                        <td colSpan={5} style={{ background: '#f7fafc', padding: '10px 14px' }}>
                          <div style={styles.itemsBox}>
                            {items.map((it, i) => (
                              <div key={i} style={styles.itemRow}>
                                <code style={styles.code}>{it.sku}</code>
                                <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: '12.5px' }}>{it.descricao_curta || ''}</span>
                                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>x{it.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <div style={styles.footer}>{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  toolbar: { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' },
  searchWrapper: { flex: 1, minWidth: '200px', position: 'relative' },
  searchIcon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' },
  code: { background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12.5px', fontFamily: 'monospace', color: '#2b6cb0' },
  itemsBox: { display: 'flex', flexDirection: 'column', gap: '6px' },
  itemRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0', borderBottom: '1px solid var(--border)' },
  itemRowInline: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', whiteSpace: 'nowrap' },
  custom: { marginLeft: '8px', fontSize: '10.5px', fontWeight: 700, color: '#9a6a00', background: '#fff4e0', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' },
  footer: { padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' },
  periodBar: { display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' },
  presets: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  presetChip: { padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  presetActive: { background: 'var(--btn-primary)', borderColor: 'var(--btn-primary)', color: '#fff' },
  dateRange: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' },
  dateInput: { padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px' },
  summary: { padding: '12px 14px', background: '#f7fafc', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '16px' },
  summaryK: { fontSize: '12px', color: 'var(--text-muted)' },
  summaryV: { fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' },
};
