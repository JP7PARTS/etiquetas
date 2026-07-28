import React, { useState, useEffect } from 'react';
import api from '../utils/api.js';

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

export default function SkuUsage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('etiquetas'); // etiquetas | geracoes | ultima
  const [dir, setDir] = useState('desc');             // desc = mais/mais recente | asc = menos/mais antigo
  const [preset, setPreset] = useState('30d');        // todos | hoje | 7d | 30d
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  function effectiveRange() {
    if (fromDate || toDate) return { from: fromDate || null, to: toDate || null };
    const today = new Date();
    if (preset === 'hoje') return { from: ymd(today), to: ymd(today) };
    if (preset === '7d') { const s = new Date(); s.setDate(s.getDate() - 6); return { from: ymd(s), to: ymd(today) }; }
    if (preset === '30d') { const s = new Date(); s.setDate(s.getDate() - 29); return { from: ymd(s), to: ymd(today) }; }
    return { from: null, to: null };
  }

  const range = effectiveRange();
  const periodActive = !!(range.from || range.to);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [preset, fromDate, toDate]);

  async function load() {
    setLoading(true); setError('');
    try {
      const { from, to } = effectiveRange();
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get('/history/stats', { params });
      setRows(res.data);
    } catch (err) {
      setError('Erro ao carregar ranking: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  function setPresetClear(p) { setPreset(p); setFromDate(''); setToDate(''); }
  function fmtDate(s) { try { return s ? new Date(s).toLocaleDateString('pt-BR') : '—'; } catch { return '—'; } }

  function exportCSV() {
    const header = 'sku;descricao;vezes_gerado;etiquetas;ultima_geracao';
    const lines = filtered.map(r =>
      [r.sku, r.descricao_curta || '', r.geracoes, r.etiquetas, fmtDate(r.ultima)].map(csvField).join(';')
    );
    saveCSV(header + '\n' + lines.join('\n') + '\n', `ranking_skus_${ymd(new Date())}.csv`);
  }

  const q = search.trim().toLowerCase();
  const val = r => sortBy === 'ultima' ? (r.ultima ? new Date(r.ultima).getTime() : 0) : r[sortBy];
  const filtered = rows
    .filter(r => !q || r.sku.toLowerCase().includes(q) || (r.descricao_curta || '').toLowerCase().includes(q))
    .sort((a, b) => { const d = val(a) - val(b); return dir === 'desc' ? -d : d; });

  const totalEtiquetas = rows.reduce((s, r) => s + r.etiquetas, 0);
  const usados = rows.filter(r => r.etiquetas > 0).length;
  const semUso = rows.length - usados;

  const dirDesc = sortBy === 'ultima' ? 'Mais recente' : 'Mais usados';
  const dirAsc = sortBy === 'ultima' ? 'Mais antigo' : 'Menos usados';

  return (
    <div>
      <div className="page-header">
        <h1>Ranking de SKUs</h1>
        <p>Quais produtos são mais e menos usados, com base no histórico de gerações</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div style={styles.toolbar}>
          <div style={styles.searchWrapper}>
            <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar SKU ou descrição..." style={{ paddingLeft: '34px' }} />
          </div>
          <button className="btn-outline" onClick={exportCSV} disabled={loading || filtered.length === 0}>Exportar CSV</button>
          <button className="btn-outline" onClick={load}>Atualizar</button>
        </div>

        {/* Período */}
        <div style={styles.periodBar}>
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

        {/* Ordenação */}
        <div style={styles.controls}>
          <div style={styles.group}>
            <span style={styles.groupLabel}>Ordem</span>
            <button onClick={() => setDir('desc')} style={{ ...styles.chip, ...(dir === 'desc' ? styles.chipOn : {}) }}>{dirDesc}</button>
            <button onClick={() => setDir('asc')} style={{ ...styles.chip, ...(dir === 'asc' ? styles.chipOn : {}) }}>{dirAsc}</button>
          </div>
          <div style={styles.group}>
            <span style={styles.groupLabel}>Por</span>
            <button onClick={() => setSortBy('etiquetas')} style={{ ...styles.chip, ...(sortBy === 'etiquetas' ? styles.chipOn : {}) }}>Etiquetas</button>
            <button onClick={() => setSortBy('geracoes')} style={{ ...styles.chip, ...(sortBy === 'geracoes' ? styles.chipOn : {}) }}>Vezes gerado</button>
            <button onClick={() => setSortBy('ultima')} style={{ ...styles.chip, ...(sortBy === 'ultima' ? styles.chipOn : {}) }}>Última geração</button>
          </div>
        </div>

        {!loading && (
          <div style={styles.summary}>
            {rows.length} SKUs · {usados} usados · <b>{semUso}</b> {periodActive ? 'sem uso no período' : 'nunca usados'} · {totalEtiquetas} etiquetas
          </div>
        )}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>Carregando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>{search ? 'Nada encontrado' : 'Nenhum SKU cadastrado'}</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                  <th>SKU</th>
                  <th>Descrição</th>
                  <th style={{ textAlign: 'center' }}>Vezes gerado</th>
                  <th style={{ textAlign: 'center' }}>Etiquetas</th>
                  <th style={{ textAlign: 'center' }}>Última geração</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.sku} style={r.etiquetas === 0 ? { background: '#fffaf0' } : undefined}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                    <td><code style={styles.code}>{r.sku}</code></td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {r.descricao_curta || '—'}
                      {r.etiquetas === 0 && <span style={styles.neverTag}>{periodActive ? 'sem uso' : 'nunca usado'}</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{r.geracoes}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.etiquetas}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', color: r.ultima ? 'var(--text-secondary)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(r.ultima)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={styles.footer}>{filtered.length} SKU{filtered.length !== 1 ? 's' : ''}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  toolbar: { display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' },
  searchWrapper: { flex: 1, minWidth: '200px', position: 'relative' },
  searchIcon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' },
  periodBar: { display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  controls: { display: 'flex', gap: '18px', flexWrap: 'wrap', marginBottom: '14px' },
  group: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  groupLabel: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginRight: '2px' },
  chip: { padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'var(--btn-primary)', borderColor: 'var(--btn-primary)', color: '#fff' },
  dateInput: { padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px' },
  summary: { padding: '10px 14px', background: '#f7fafc', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', color: 'var(--text-secondary)' },
  code: { background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12.5px', fontFamily: 'monospace', color: '#2b6cb0' },
  neverTag: { marginLeft: '8px', fontSize: '10.5px', fontWeight: 700, color: '#9a6a00', background: '#fff4e0', padding: '2px 8px', borderRadius: '10px' },
  footer: { padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' },
};
