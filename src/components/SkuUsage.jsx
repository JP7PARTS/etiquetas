import React, { useState, useEffect } from 'react';
import api from '../utils/api.js';

export default function SkuUsage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('etiquetas'); // etiquetas | geracoes
  const [dir, setDir] = useState('desc');             // desc = mais usados | asc = menos

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await api.get('/history/stats');
      setRows(res.data);
    } catch (err) {
      setError('Erro ao carregar ranking: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = rows
    .filter(r => !q || r.sku.toLowerCase().includes(q) || (r.descricao_curta || '').toLowerCase().includes(q))
    .sort((a, b) => {
      const d = (a[sortBy] - b[sortBy]);
      return dir === 'desc' ? -d : d;
    });

  const totalEtiquetas = rows.reduce((s, r) => s + r.etiquetas, 0);
  const usados = rows.filter(r => r.etiquetas > 0).length;
  const nuncaUsados = rows.length - usados;

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
          <button className="btn-outline" onClick={load}>Atualizar</button>
        </div>

        <div style={styles.controls}>
          <div style={styles.group}>
            <span style={styles.groupLabel}>Ordem</span>
            <button onClick={() => setDir('desc')} style={{ ...styles.chip, ...(dir === 'desc' ? styles.chipOn : {}) }}>Mais usados</button>
            <button onClick={() => setDir('asc')} style={{ ...styles.chip, ...(dir === 'asc' ? styles.chipOn : {}) }}>Menos usados</button>
          </div>
          <div style={styles.group}>
            <span style={styles.groupLabel}>Por</span>
            <button onClick={() => setSortBy('etiquetas')} style={{ ...styles.chip, ...(sortBy === 'etiquetas' ? styles.chipOn : {}) }}>Etiquetas</button>
            <button onClick={() => setSortBy('geracoes')} style={{ ...styles.chip, ...(sortBy === 'geracoes' ? styles.chipOn : {}) }}>Vezes gerado</button>
          </div>
        </div>

        {!loading && (
          <div style={styles.summary}>
            {rows.length} SKUs · {usados} já usados · <b>{nuncaUsados}</b> nunca usados · {totalEtiquetas} etiquetas no total
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
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.sku} style={r.etiquetas === 0 ? { background: '#fffaf0' } : undefined}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                    <td><code style={styles.code}>{r.sku}</code></td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {r.descricao_curta || '—'}
                      {r.etiquetas === 0 && <span style={styles.neverTag}>nunca usado</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{r.geracoes}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.etiquetas}</td>
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
  controls: { display: 'flex', gap: '18px', flexWrap: 'wrap', marginBottom: '14px' },
  group: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  groupLabel: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginRight: '2px' },
  chip: { padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'var(--btn-primary)', borderColor: 'var(--btn-primary)', color: '#fff' },
  summary: { padding: '10px 14px', background: '#f7fafc', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', color: 'var(--text-secondary)' },
  code: { background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12.5px', fontFamily: 'monospace', color: '#2b6cb0' },
  neverTag: { marginLeft: '8px', fontSize: '10.5px', fontWeight: 700, color: '#9a6a00', background: '#fff4e0', padding: '2px 8px', borderRadius: '10px' },
  footer: { padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' },
};
