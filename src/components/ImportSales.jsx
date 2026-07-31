import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import api from '../utils/api.js';

export default function ImportSales({ onSendToLote }) {
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);      // [{ code, qty, skuObj|null }]
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('qty');  // qty | sku
  const inputRef = useRef(null);

  function qtyOf(v) { const n = parseInt(Number(v), 10); return isNaN(n) ? 0 : n; }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setError(''); setItems([]); setSelected(new Set());
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

      const hdrIdx = matrix.findIndex(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() === 'SKU'));
      if (hdrIdx < 0) throw new Error('Não encontrei a coluna "SKU" na planilha. Confirme se é o relatório de vendas do Mercado Livre.');
      const header = matrix[hdrIdx].map(c => String(c ?? '').trim());
      const ciSku = header.indexOf('SKU');
      const ciUn = header.indexOf('Unidades');
      if (ciUn < 0) throw new Error('Não encontrei a coluna "Unidades" na planilha.');

      const agg = new Map(); // UPPER(sku) -> { code, qty }
      for (let i = hdrIdx + 1; i < matrix.length; i++) {
        const row = matrix[i];
        if (!Array.isArray(row)) continue;
        const raw = row[ciSku];
        const code = raw == null ? '' : String(raw).trim();
        if (!code) continue;
        const q = qtyOf(row[ciUn]) || 1;
        const key = code.toUpperCase();
        if (agg.has(key)) agg.get(key).qty += q;
        else agg.set(key, { code, qty: q });
      }
      if (agg.size === 0) throw new Error('Nenhum SKU encontrado nas linhas da planilha.');

      // Cruza com o catálogo
      const res = await api.get('/skus');
      const byCode = new Map(res.data.map(s => [s.sku.toUpperCase(), s]));
      const list = Array.from(agg.values()).map(({ code, qty }) => ({
        code, qty, skuObj: byCode.get(code.toUpperCase()) || null,
      }));
      setItems(list);
    } catch (err) {
      setError(err.message || 'Erro ao ler a planilha');
      setFileName('');
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function toggle(code) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code); else n.add(code);
      return n;
    });
  }
  function selectAllCadastrados() {
    setSelected(new Set(items.filter(i => i.skuObj).map(i => i.code)));
  }
  function clearSel() { setSelected(new Set()); }

  const q = search.trim().toLowerCase();
  const filtered = items
    .filter(i => !q || i.code.toLowerCase().includes(q) || (i.skuObj?.descricao_curta || '').toLowerCase().includes(q))
    .sort((a, b) => sortBy === 'qty' ? (b.qty - a.qty) : a.code.localeCompare(b.code));

  const totalUnid = items.reduce((s, i) => s + i.qty, 0);
  const naoCadastrados = items.filter(i => !i.skuObj).length;
  const selCount = selected.size;
  const selUnid = items.filter(i => selected.has(i.code)).reduce((s, i) => s + i.qty, 0);

  function enviar() {
    const payload = items
      .filter(i => selected.has(i.code) && i.skuObj)
      .map(i => ({ sku: i.skuObj, qty: Math.min(999, Math.max(1, i.qty)) }));
    if (payload.length === 0) return;
    onSendToLote(payload);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Importar Vendas</h1>
        <p>Suba a planilha de vendas do Mercado Livre — o sistema soma os SKUs e você escolhe quais imprimir</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div style={styles.uploadRow}>
          <button className="btn-primary" onClick={() => inputRef.current?.click()} disabled={parsing}>
            {parsing ? 'Lendo planilha...' : '📥 Escolher planilha (.xlsx)'}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          {fileName && !parsing && <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{fileName}</span>}
        </div>

        {items.length > 0 && (
          <>
            <div style={styles.summary}>
              <b>{items.length}</b> SKUs · <b>{totalUnid}</b> unidades vendidas
              {naoCadastrados > 0 && <span style={{ color: '#c53030' }}> · {naoCadastrados} não cadastrado{naoCadastrados !== 1 ? 's' : ''}</span>}
            </div>

            <div style={styles.toolbar}>
              <div style={styles.searchWrapper}>
                <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar SKU ou descrição..." style={{ paddingLeft: '34px' }} />
              </div>
              <div style={styles.group}>
                <span style={styles.groupLabel}>Ordenar</span>
                <button onClick={() => setSortBy('qty')} style={{ ...styles.chip, ...(sortBy === 'qty' ? styles.chipOn : {}) }}>Qtde</button>
                <button onClick={() => setSortBy('sku')} style={{ ...styles.chip, ...(sortBy === 'sku' ? styles.chipOn : {}) }}>SKU</button>
              </div>
            </div>

            <div style={styles.selBar}>
              <button className="btn-outline" style={{ padding: '5px 12px' }} onClick={selectAllCadastrados}>Selecionar todos (cadastrados)</button>
              <button className="btn-outline" style={{ padding: '5px 12px' }} onClick={clearSel}>Limpar seleção</button>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '55vh', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>SKU</th>
                    <th>Descrição</th>
                    <th style={{ textAlign: 'center', width: '110px' }}>Qtde vendida</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(i => (
                    <tr key={i.code} style={!i.skuObj ? { background: '#fffaf0' } : (selected.has(i.code) ? { background: '#ebf8ff' } : undefined)}>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={selected.has(i.code)} disabled={!i.skuObj}
                          onChange={() => toggle(i.code)} style={{ width: '16px', height: '16px', cursor: i.skuObj ? 'pointer' : 'not-allowed' }} />
                      </td>
                      <td><code style={styles.code}>{i.code}</code></td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {i.skuObj ? (i.skuObj.descricao_curta || '—') : <span style={styles.naoTag}>não cadastrado</span>}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{i.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={styles.footer}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {selCount} selecionado{selCount !== 1 ? 's' : ''} · {selUnid} etiqueta{selUnid !== 1 ? 's' : ''}
              </span>
              <button className="btn-primary" onClick={enviar} disabled={selCount === 0}>
                Enviar {selCount > 0 ? selCount : ''} ao Lote →
              </button>
            </div>
          </>
        )}

        {items.length === 0 && !parsing && (
          <div className="empty-state" style={{ marginTop: '8px' }}>
            <p>Escolha a planilha de vendas (.xlsx) para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  uploadRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' },
  summary: { padding: '10px 14px', background: '#f7fafc', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '14px', fontSize: '14px', color: 'var(--text-secondary)' },
  toolbar: { display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  searchWrapper: { flex: 1, minWidth: '200px', position: 'relative' },
  searchIcon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' },
  group: { display: 'flex', alignItems: 'center', gap: '6px' },
  groupLabel: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 },
  chip: { padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'var(--btn-primary)', borderColor: 'var(--btn-primary)', color: '#fff' },
  selBar: { display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' },
  code: { background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12.5px', fontFamily: 'monospace', color: '#2b6cb0' },
  naoTag: { fontSize: '11px', fontWeight: 700, color: '#9a6a00', background: '#fff4e0', padding: '2px 8px', borderRadius: '10px' },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '14px', marginTop: '4px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' },
};
