import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import api from '../utils/api.js';

const MESES = {
  janeiro: 0, fevereiro: 1, 'março': 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};
function parseSaleDate(v) {
  if (!v) return null;
  const m = String(v).match(/(\d{1,2}) de (\S+) de (\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const mi = MESES[m[2].toLowerCase()];
  if (mi == null) return null;
  return new Date(Number(m[3]), mi, Number(m[1]), Number(m[4]), Number(m[5]));
}
function fmtDT(d) {
  if (!d) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ImportSales({ onSendToLote }) {
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [parsedRows, setParsedRows] = useState([]); // [{ code, qty, cartId|null, saleDate:Date|null, skuObj }]
  const [dateFrom, setDateFrom] = useState('');     // datetime-local
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState(new Set());     // SKUs normais
  const [selCarts, setSelCarts] = useState(new Set());     // ids de carrinhos
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('qty');  // qty | sku
  const inputRef = useRef(null);

  function qtyOf(v) { const n = parseInt(Number(v), 10); return isNaN(n) ? 0 : n; }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setError(''); setParsedRows([]); setSelected(new Set()); setSelCarts(new Set());
    setDateFrom(''); setDateTo('');
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
      const ciPac = header.indexOf('Pacote de diversos produtos');
      const ciComp = header.indexOf('Comprador');
      const ciData = header.indexOf('Data da venda');
      if (ciUn < 0) throw new Error('Não encontrei a coluna "Unidades" na planilha.');

      const rows = [];       // achatado: { code, qty, cartId|null, saleDate }
      let curCartId = null;
      let cartSeq = 0;
      for (let i = hdrIdx + 1; i < matrix.length; i++) {
        const row = matrix[i];
        if (!Array.isArray(row)) continue;
        const raw = row[ciSku];
        const code = raw == null ? '' : String(raw).trim();
        const pac = ciPac >= 0 ? String(row[ciPac] ?? '').trim() : '';
        const comp = ciComp >= 0 ? String(row[ciComp] ?? '').trim() : '';
        const q = qtyOf(row[ciUn]) || 1;
        const saleDate = ciData >= 0 ? parseSaleDate(row[ciData]) : null;

        if (!code) { curCartId = ++cartSeq; continue; }              // separador → inicia carrinho
        if (curCartId && pac === 'Sim' && !comp) {                    // item de carrinho
          rows.push({ code, qty: q, cartId: curCartId, saleDate });
          continue;
        }
        curCartId = null;                                            // venda normal
        rows.push({ code, qty: q, cartId: null, saleDate });
      }
      if (rows.length === 0) throw new Error('Nenhum SKU encontrado nas linhas da planilha.');

      // Cruza com o catálogo
      const res = await api.get('/skus');
      const byCode = new Map(res.data.map(s => [s.sku.toUpperCase(), s]));
      setParsedRows(rows.map(r => ({ ...r, skuObj: byCode.get(r.code.toUpperCase()) || null })));
    } catch (err) {
      setError(err.message || 'Erro ao ler a planilha');
      setFileName('');
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  // Deriva itens normais + carrinhos a partir das linhas, aplicando o filtro de data/hora
  const { items, carts, detMin, detMax } = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    const active = !!(from || to);
    const inRange = d => {
      if (!d) return !active;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    };
    let mn = null, mx = null;
    for (const r of parsedRows) if (r.saleDate) { if (!mn || r.saleDate < mn) mn = r.saleDate; if (!mx || r.saleDate > mx) mx = r.saleDate; }
    const agg = new Map();
    const cartMap = new Map();
    for (const r of parsedRows) {
      if (!inRange(r.saleDate)) continue;
      if (r.cartId) {
        if (!cartMap.has(r.cartId)) cartMap.set(r.cartId, []);
        cartMap.get(r.cartId).push(r);
      } else {
        const k = r.code.toUpperCase();
        if (agg.has(k)) agg.get(k).qty += r.qty;
        else agg.set(k, { code: r.code, qty: r.qty, skuObj: r.skuObj });
      }
    }
    return {
      items: Array.from(agg.values()),
      carts: Array.from(cartMap.entries()).map(([id, its]) => ({
        id, label: `Carrinho ${id}`, items: its.map(r => ({ code: r.code, qty: r.qty, skuObj: r.skuObj })),
      })),
      detMin: mn, detMax: mx,
    };
  }, [parsedRows, dateFrom, dateTo]);

  function toggle(code) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code); else n.add(code);
      return n;
    });
  }
  function toggleCart(id) {
    setSelCarts(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function selectAllCadastrados() {
    setSelected(new Set(items.filter(i => i.skuObj).map(i => i.code)));
    setSelCarts(new Set(carts.filter(c => c.items.some(it => it.skuObj)).map(c => c.id)));
  }
  function clearSel() { setSelected(new Set()); setSelCarts(new Set()); }

  const q = search.trim().toLowerCase();
  const filtered = items
    .filter(i => !q || i.code.toLowerCase().includes(q) || (i.skuObj?.descricao_curta || '').toLowerCase().includes(q))
    .sort((a, b) => sortBy === 'qty' ? (b.qty - a.qty) : a.code.localeCompare(b.code));

  const totalUnid = items.reduce((s, i) => s + i.qty, 0) + carts.reduce((s, c) => s + c.items.reduce((a, it) => a + it.qty, 0), 0);
  const naoCadastrados = items.filter(i => !i.skuObj).length + carts.reduce((s, c) => s + c.items.filter(it => !it.skuObj).length, 0);

  // Contagem da seleção (SKUs normais + itens de carrinhos selecionados, só cadastrados)
  const selNormal = items.filter(i => selected.has(i.code) && i.skuObj);
  const selCartItems = carts.filter(c => selCarts.has(c.id)).flatMap(c => c.items.filter(it => it.skuObj));
  const selCount = selNormal.length + selCartItems.length;
  const selUnid = [...selNormal, ...selCartItems].reduce((s, i) => s + Math.min(999, Math.max(1, i.qty)), 0);

  function enviar() {
    const payload = [
      ...selNormal.map(i => ({ sku: i.skuObj, qty: Math.min(999, Math.max(1, i.qty)) })),
      ...carts.filter(c => selCarts.has(c.id)).flatMap(c =>
        c.items.filter(it => it.skuObj).map(it => ({ sku: it.skuObj, qty: Math.min(999, Math.max(1, it.qty)), cart: c.label }))
      ),
    ];
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

        {parsedRows.length > 0 && (
          <div style={styles.filterBar}>
            <div style={styles.group}>
              <span style={styles.groupLabel}>De</span>
              <input type="datetime-local" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={styles.dt} />
              <span style={styles.groupLabel}>até</span>
              <input type="datetime-local" value={dateTo} onChange={e => setDateTo(e.target.value)} style={styles.dt} />
              {(dateFrom || dateTo) && (
                <button className="btn-outline" style={{ padding: '5px 10px' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>Usar tudo</button>
              )}
            </div>
            {detMin && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Vendas na planilha: {fmtDT(detMin)} → {fmtDT(detMax)}
              </span>
            )}
          </div>
        )}

        {(items.length > 0 || carts.length > 0) ? (
          <>
            <div style={styles.summary}>
              <b>{items.length}</b> SKUs · <b>{totalUnid}</b> unidades vendidas
              {carts.length > 0 && <span> · <b>{carts.length}</b> carrinho{carts.length !== 1 ? 's' : ''} 🛒</span>}
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
                  {/* Carrinhos primeiro, agrupados e destacados */}
                  {carts.map(c => {
                    const printable = c.items.some(it => it.skuObj);
                    const on = selCarts.has(c.id);
                    return c.items.map((it, k) => (
                      <tr key={`c${c.id}-${k}`} style={{ background: on ? '#e6f0ff' : '#f5f8ff' }}>
                        <td style={{ textAlign: 'center' }}>
                          {k === 0 && (
                            <input type="checkbox" checked={on} disabled={!printable}
                              onChange={() => toggleCart(c.id)} style={{ width: '16px', height: '16px', cursor: printable ? 'pointer' : 'not-allowed' }} />
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {k === 0 && <span style={styles.cartTag}>🛒 {c.label}</span>}
                          <code style={styles.code}>{it.code}</code>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {it.skuObj ? (it.skuObj.descricao_curta || '—') : <span style={styles.naoTag}>não cadastrado</span>}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.qty}</td>
                      </tr>
                    ));
                  })}
                  {/* SKUs normais */}
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
        ) : parsedRows.length > 0 ? (
          <div className="empty-state" style={{ marginTop: '8px' }}>
            <p>Nenhuma venda no período selecionado.</p>
          </div>
        ) : null}

        {parsedRows.length === 0 && !parsing && (
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
  filterBar: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' },
  dt: { padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px' },
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
  cartTag: { display: 'inline-block', marginRight: '8px', fontSize: '10.5px', fontWeight: 700, color: '#2b4c8c', background: '#dbe8ff', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '14px', marginTop: '4px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' },
};
