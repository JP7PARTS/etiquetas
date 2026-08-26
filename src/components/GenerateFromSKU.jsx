import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import ZPLOutput from './ZPLOutput.jsx';
import { normalizeQuantity, copyZPL } from '../utils/zpl.js';
import { backdropHandlers } from '../utils/backdrop.js';

// Medidas da embalagem (envio) para exibição: "C×L×A cm · P kg · vol V kg".
// Volumétrico = C×L×A(cm) / 6000, só quando as 3 medidas existem.
const nnum = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const kg = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: n < 1 ? 3 : 1, maximumFractionDigits: 3 });
function medidasDe(sku) {
  const c = nnum(sku.comprimento_cm), l = nnum(sku.largura_cm), a = nnum(sku.altura_cm), p = nnum(sku.peso_kg);
  if (c == null && l == null && a == null && p == null) return null;
  const dims = (c != null || l != null || a != null) ? `${[c, l, a].map(v => v != null ? v : '?').join('×')} cm` : null;
  const peso = p != null ? `${kg(p)} kg` : null;
  const vol = (c > 0 && l > 0 && a > 0) ? `vol ${kg((c * l * a) / 6000)} kg` : null;
  return { dims, peso, vol };
}

const TIPO_ENVIO_LABEL = {
  propria: { txt: '📦 Emb. própria', color: '#2b6cb0', bg: '#ebf8ff' },
  sem: { txt: '⚠️ Sem embalagem', color: '#c05621', bg: '#fffaf0' },
  padrao: { txt: '📦', color: '#276749', bg: '#f0fff4' },
};

let rowSeq = 1;
function newRow(sku = null) {
  return { id: rowSeq++, selected: sku, search: sku ? sku.sku : '', quantity: 1, useAlt: false };
}

export default function GenerateFromSKU({ user, seed, onSeedConsumed }) {
  const isAdmin = user?.role === 'admin';
  const [skus, setSkus] = useState([]);
  const [embalagens, setEmbalagens] = useState([]);
  const embMap = React.useMemo(() => { const m = {}; embalagens.forEach(e => { m[e.id] = e; }); return m; }, [embalagens]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copiedOnGenerate, setCopiedOnGenerate] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [localFilter, setLocalFilter] = useState('');
  const [sortState, setSortState] = useState({ key: null, dir: 'asc' });
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const backdropDown = useRef(false);
  // Solicitar/Cadastrar SKU a partir da busca sem resultado
  const [reqForm, setReqForm] = useState(null);      // operador: { sku, titulo, local }
  const [reqSaving, setReqSaving] = useState(false);
  const [reqErr, setReqErr] = useState('');
  const [reqDone, setReqDone] = useState('');        // SKU solicitado (feedback)
  const [newSku, setNewSku] = useState(null);        // admin: { sku, descricao_curta, ... }
  const [newSaving, setNewSaving] = useState(false);
  const [newErr, setNewErr] = useState('');

  async function sendSkuRequest(e) {
    e.preventDefault();
    setReqSaving(true); setReqErr('');
    try {
      await api.post('/sku-requests', reqForm);
      setReqDone(reqForm.sku.trim().toUpperCase());
      setReqForm(null);
    } catch (err) {
      setReqErr(err.response?.data?.error || 'Erro ao enviar solicitação');
    } finally {
      setReqSaving(false);
    }
  }

  async function createSku(e) {
    e.preventDefault();
    setNewSaving(true); setNewErr('');
    try {
      await api.post('/skus', newSku);
      await loadSKUs(true);
      setNewSku(null);
    } catch (err) {
      if (err.response?.status === 409) { await loadSKUs(true); setNewSku(null); }
      else setNewErr(err.response?.data?.error || 'Erro ao cadastrar SKU');
    } finally {
      setNewSaving(false);
    }
  }

  useEffect(() => {
    loadSKUs();
    api.get('/embalagens').then(r => setEmbalagens(r.data || [])).catch(() => {});
    // Recarrega o catálogo ao voltar o foco para a aba (pega SKUs recém-cadastrados)
    const onFocus = () => loadSKUs(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Recebe SKUs vindos da tela "Importar Vendas" e mescla no lote
  useEffect(() => {
    if (!seed || seed.length === 0) return;
    setRows(prev => {
      const next = prev.map(r => ({ ...r }));
      seed.forEach(({ sku, qty, cart }) => {
        if (cart) {
          // Item de carrinho: linha própria, nunca mescla
          next.push({ ...newRow(sku), quantity: Math.min(999, Math.max(1, qty)), cart });
          return;
        }
        const ex = next.find(r => r.selected && !r.cart && r.selected.sku.toUpperCase() === sku.sku.toUpperCase());
        if (ex) ex.quantity = Math.min(999, (parseInt(ex.quantity, 10) || 0) + qty);
        else next.push({ ...newRow(sku), quantity: Math.min(999, Math.max(1, qty)) });
      });
      return next;
    });
    setResult(null);
    if (onSeedConsumed) onSeedConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  // Locais únicos para chips de filtro
  const locais = Array.from(
    new Set(skus.map(s => (s.local || '').trim()).filter(Boolean))
  ).sort();

  // SKUs na tabela: filtrados por texto + localização
  const tableSkus = skus.filter(s => {
    const matchLocal = !localFilter || (s.local || '').trim() === localFilter;
    const q = tableSearch.trim().toLowerCase();
    const matchText = !q ||
      s.sku.toLowerCase().includes(q) ||
      (s.descricao_curta && s.descricao_curta.toLowerCase().includes(q)) ||
      (s.descricao_curta_2 && s.descricao_curta_2.toLowerCase().includes(q)) ||
      (s.descricao_longa && s.descricao_longa.toLowerCase().includes(q));
    return matchLocal && matchText;
  });

  async function loadSKUs(silent = false) {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get('/skus');
      setSkus(res.data);
    } catch (err) {
      if (!silent) setError('Erro ao carregar SKUs: ' + (err.response?.data?.error || err.message));
    } finally {
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }

  function updateRow(id, patch) {
    setRows(rows => rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
    setResult(null);
  }

  function addRow(sku = null) {
    setRows(rows => [...rows, newRow(sku)]);
    setResult(null);
  }

  function removeRow(id) {
    setRows(rows => rows.filter(r => r.id !== id));
    setResult(null);
  }

  // Ordena o lote por SKU (A→Z) ou por quantidade; clicar de novo inverte a direção.
  // Linhas de carrinho ficam agrupadas ao final (mantêm o vínculo).
  function sortLote(key) {
    const dir = sortState.key === key && sortState.dir === 'asc' ? 'desc' : 'asc';
    const mult = dir === 'asc' ? 1 : -1;
    setRows(prev => {
      const normal = prev.filter(r => !r.cart);
      const cartRows = prev.filter(r => r.cart);
      normal.sort((a, b) => {
        if (!a.selected) return 1;
        if (!b.selected) return -1;
        if (key === 'qty') return ((normalizeQuantity(a.quantity)) - (normalizeQuantity(b.quantity))) * mult;
        return a.selected.sku.localeCompare(b.selected.sku) * mult;
      });
      return [...normal, ...cartRows];
    });
    setSortState({ key, dir });
    setResult(null);
  }

  // --- Importar lista colada da planilha ---
  const skuByCode = new Map(skus.map(s => [s.sku.toUpperCase(), s]));

  function parseImport(text) {
    const map = new Map(); // UPPER(sku) -> { code, qty }
    let ignoredZero = 0;
    text.split(/\r?\n/).forEach(line => {
      const t = line.trim();
      if (!t) return;
      let parts = t.split(/[\t;,]+/).map(x => x.trim()).filter(Boolean);
      if (parts.length < 2) parts = t.split(/\s+/).filter(Boolean);
      if (parts.length === 0) return;
      const code = parts[0];
      let qty = 1;           // default quando não há número na linha
      let explicit = false;
      for (let i = parts.length - 1; i >= 1; i--) {
        if (/^\d+$/.test(parts[i])) { qty = parseInt(parts[i], 10); explicit = true; break; }
      }
      // Quantidade 0 explícita = não vendeu → ignora o SKU
      if (explicit && qty <= 0) { ignoredZero++; return; }
      qty = Math.max(1, Math.min(qty, 999));
      const key = code.toUpperCase();
      if (map.has(key)) map.get(key).qty = Math.min(999, map.get(key).qty + qty);
      else map.set(key, { code, qty });
    });
    return { map, ignoredZero };
  }

  const { map: importParsed, ignoredZero: importIgnoredZero } = showImport
    ? parseImport(importText)
    : { map: new Map(), ignoredZero: 0 };
  const importMatched = [];
  const importNotFound = [];
  importParsed.forEach(({ code, qty }) => {
    const s = skuByCode.get(code.toUpperCase());
    if (s) importMatched.push({ sku: s, qty });
    else importNotFound.push(code);
  });

  function applyImport() {
    setRows(prev => {
      const next = prev.map(r => ({ ...r }));
      importMatched.forEach(({ sku, qty }) => {
        const ex = next.find(r => r.selected && !r.cart && r.selected.sku.toUpperCase() === sku.sku.toUpperCase());
        if (ex) ex.quantity = Math.min(999, (parseInt(ex.quantity, 10) || 0) + qty);
        else next.push({ ...newRow(sku), quantity: qty });
      });
      return next;
    });
    setResult(null);
    setShowImport(false);
    setImportText('');
  }

  const selectedRows = rows.filter(r => r.selected);
  const totalQuantity = selectedRows.reduce((s, r) => s + normalizeQuantity(r.quantity), 0);

  async function handleGenerate(e) {
    e.preventDefault();
    if (selectedRows.length === 0) return;
    setError('');
    setGenerating(true);
    try {
      const items = selectedRows.map(r => ({
        sku: r.selected.sku,
        descricao_curta: (r.useAlt && r.selected.descricao_curta_2)
          ? r.selected.descricao_curta_2
          : (r.selected.descricao_curta || ''),
        quantity: normalizeQuantity(r.quantity),
      }));
      const res = await api.post('/labels/generate-batch', { items });
      setResult(res.data);
      // Registra no histórico (não bloqueia o fluxo se falhar)
      api.post('/history', { items, origin: 'lote' }).catch(() => {});
      try {
        await copyZPL(res.data.zpl);
        setCopiedOnGenerate(true);
        setTimeout(() => setCopiedOnGenerate(false), 3000);
      } catch {
        setCopiedOnGenerate(false);
      }
    } catch (err) {
      setError('Erro ao gerar ZPL: ' + (err.response?.data?.error || err.message));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Gerar / Imprimir em Lote</h1>
        <p>Selecione SKUs à esquerda e monte seu lote à direita</p>
      </div>

      {error && <div className="alert alert-error" style={{marginBottom: '16px'}}>{error}</div>}

      <div style={styles.container}>
        {/* TABELA (ESQUERDA) */}
        <div style={styles.tablePanel}>
          <div className="card" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px'}}>
              <h3 style={{...styles.panelTitle, margin: 0}}>Catálogo de SKUs</h3>
              <button type="button" onClick={() => loadSKUs(true)} disabled={refreshing || loading} style={styles.toolBtn}>
                {refreshing ? 'Atualizando...' : 'Atualizar'}
              </button>
            </div>

            {/* Busca + Filtro */}
            <div style={styles.searchSection}>
              <div style={styles.searchWrapper}>
                <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  placeholder="Buscar SKU ou descrição..."
                  style={{paddingLeft: '34px'}}
                />
              </div>

              {locais.length > 0 && (
                <div style={styles.localFilterChips}>
                  <button
                    type="button"
                    onClick={() => setLocalFilter('')}
                    style={{...styles.localChip, ...(localFilter === '' ? styles.localChipActive : {})}}
                  >
                    Todos
                  </button>
                  {locais.map(l => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLocalFilter(l === localFilter ? '' : l)}
                      style={{...styles.localChip, ...(localFilter === l ? styles.localChipActive : {})}}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tabela */}
            {loading ? (
              <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <div style={{textAlign: 'center'}}>
                  <div className="spinner" />
                  <p style={{marginTop: '12px', color: 'var(--text-muted)'}}>Carregando...</p>
                </div>
              </div>
            ) : tableSkus.length === 0 ? (
              <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <div style={{textAlign: 'center', color: 'var(--text-muted)'}}>
                  <p>{tableSearch || localFilter ? 'Nenhum SKU encontrado' : 'Nenhum SKU disponível'}</p>
                  {tableSearch.trim() && reqDone === tableSearch.trim().toUpperCase() ? (
                    <p style={{ color: '#276749', fontWeight: 600, marginTop: '8px' }}>✅ Solicitação enviada ao admin</p>
                  ) : tableSearch.trim() && (
                    isAdmin ? (
                      <button type="button" className="btn-primary" style={{ marginTop: '10px' }}
                        onClick={() => { setNewSku({ sku: tableSearch.trim().toUpperCase(), descricao_curta: '', descricao_curta_2: '', descricao_longa: '', local: '', comprimento_cm: '', largura_cm: '', altura_cm: '', peso_kg: '' }); setNewErr(''); }}>
                        ➕ Cadastrar SKU
                      </button>
                    ) : (
                      <button type="button" className="btn-primary" style={{ marginTop: '10px' }}
                        onClick={() => { setReqForm({ sku: tableSearch.trim().toUpperCase(), titulo: '', local: '' }); setReqErr(''); }}>
                        📨 Solicitar inclusão do SKU
                      </button>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div style={{flex: 1, overflowY: 'auto', minHeight: 0}}>
                <table style={styles.table}>
                  <thead style={styles.tableHead}>
                    <tr>
                      <th style={styles.colSku}>SKU</th>
                      <th style={styles.colDesc}>Descrição</th>
                      <th style={styles.colLocal}>Local</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '12px', whiteSpace: 'nowrap' }}>Medidas</th>
                      <th style={styles.colAction}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableSkus.map(sku => (
                      <tr key={sku.id} style={styles.tableRow}>
                        <td style={styles.colSku}>
                          <code style={styles.skuCode}>{sku.sku}</code>
                        </td>
                        <td style={styles.colDesc}>
                          <div style={styles.descPrimary}>{sku.descricao_curta || '—'}</div>
                          {sku.descricao_curta_2 && (
                            <div style={styles.descAlt}>
                              <span style={styles.descAltTag}>Alt</span>
                              {sku.descricao_curta_2}
                            </div>
                          )}
                          {sku.descricao_longa && (
                            <div style={styles.descSecondary}>
                              {sku.descricao_longa}
                            </div>
                          )}
                        </td>
                        <td style={styles.colLocal}>
                          {sku.local ? <span style={styles.badge}>{sku.local}</span> : <span style={{color: 'var(--text-muted)'}}>—</span>}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                          {sku.tipo_envio && TIPO_ENVIO_LABEL[sku.tipo_envio] && (() => { const t = TIPO_ENVIO_LABEL[sku.tipo_envio];
                            const nome = sku.tipo_envio === 'padrao' ? (embMap[sku.embalagem_id]?.nome || 'padrão') : '';
                            return <div style={{ marginBottom: '2px' }}><span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, color: t.color, background: t.bg }}>{t.txt}{nome ? ' ' + nome : ''}</span></div>; })()}
                          {(() => { const m = medidasDe(sku);
                            if (!m) return !sku.tipo_envio && <span style={{ color: 'var(--text-muted)' }}>—</span>;
                            return <div>
                              {m.dims && <div>{m.dims}{m.peso ? ` · ${m.peso}` : ''}</div>}
                              {!m.dims && m.peso && <div>{m.peso}</div>}
                              {m.vol && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.vol}</div>}
                            </div>; })()}
                        </td>
                        <td style={styles.colAction}>
                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() => addRow(sku)}
                            style={{padding: '4px 8px', fontSize: '12.5px', minWidth: '80px'}}
                          >
                            Adicionar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={styles.tableFooter}>
              {tableSkus.length} SKU{tableSkus.length !== 1 ? 's' : ''} {tableSearch || localFilter ? 'encontrado' : 'disponível'}{tableSkus.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* LOTE (DIREITA) */}
        <div style={styles.lotePanel}>
          <div className="card" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px', flexWrap: 'wrap'}}>
              <h3 style={{...styles.panelTitle, margin: 0}}>Seu Lote</h3>
              <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                <button type="button" onClick={() => setShowImport(true)} style={styles.toolBtn}>
                  Importar lista
                </button>
                {rows.length > 1 && (
                  <>
                    <button type="button" onClick={() => sortLote('sku')}
                      style={{...styles.toolBtn, ...(sortState.key === 'sku' ? styles.toolBtnActive : {})}}>
                      {sortState.key === 'sku' && sortState.dir === 'desc' ? 'Z→A' : 'A→Z'}
                    </button>
                    <button type="button" onClick={() => sortLote('qty')}
                      style={{...styles.toolBtn, ...(sortState.key === 'qty' ? styles.toolBtnActive : {})}}>
                      Qtde {sortState.key === 'qty' && sortState.dir === 'asc' ? '↑' : '↓'}
                    </button>
                  </>
                )}
                {rows.length > 0 && (
                  <button type="button" onClick={() => { setRows([]); setResult(null); }} style={styles.clearBtn}>
                    Limpar lista
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleGenerate} style={{display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0}}>
              {/* Lista de linhas do lote */}
              <div style={{flex: 1, overflowY: 'auto', minHeight: 0}}>
                {rows.length === 0 ? (
                  <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px'}}>
                    <p style={{fontSize: '14px', marginBottom: '6px'}}>Nenhum SKU adicionado</p>
                    <p style={{fontSize: '12px', color: 'var(--text-muted)'}}>Selecione SKUs à esquerda para montar sua lote</p>
                  </div>
                ) : (
                  <div>
                    <div style={styles.loteHeader}>
                      <span style={{flex: 1}}>SKU</span>
                      <span style={{width: '70px', textAlign: 'right'}}>Qtde</span>
                      <span style={{width: '30px'}}></span>
                    </div>
                    {rows.map(row => (
                      <div key={row.id} style={{...styles.loteRow, ...(row.cart ? styles.cartRow : {})}}>
                        <div style={styles.loteRowContent}>
                          <span style={{flex: 1}}>
                            {row.selected ? (
                              <>
                                {row.cart && <span style={styles.cartTag}>🛒 {row.cart}</span>}
                                <code style={styles.skuCodeInline}>{row.selected.sku}</code>
                                <span style={{fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px'}}>
                                  {(row.useAlt && row.selected.descricao_curta_2)
                                    ? row.selected.descricao_curta_2
                                    : row.selected.descricao_curta}
                                </span>
                                {row.selected.descricao_curta_2 && (
                                  <button
                                    type="button"
                                    onClick={() => updateRow(row.id, { useAlt: !row.useAlt })}
                                    title={row.useAlt
                                      ? `Usando alternativa: ${row.selected.descricao_curta_2}`
                                      : `Usando padrão: ${row.selected.descricao_curta || '—'}`}
                                    style={{...styles.altToggle, ...(row.useAlt ? styles.altToggleActive : {})}}
                                  >
                                    {row.useAlt ? 'Alt' : 'Padrão'}
                                  </button>
                                )}
                              </>
                            ) : (
                              <span style={{color: 'var(--text-muted)'}}>Vazio</span>
                            )}
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={row.quantity}
                            onChange={e => {
                              const v = e.target.value;
                              updateRow(row.id, { quantity: v === '' ? '' : Math.max(1, Math.min(parseInt(v, 10) || 1, 999)) });
                            }}
                            onBlur={() => { if (!row.quantity) updateRow(row.id, { quantity: 1 }); }}
                            style={{width: '70px', textAlign: 'center'}}
                          />
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            title="Remover"
                            style={styles.removeBtn}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sticky Footer - Sumário + Botão */}
              <div style={{position: 'sticky', bottom: 0, background: 'white', borderTop: '1px solid var(--border)', padding: '16px', zIndex: 10}}>
                {rows.length > 0 && (
                  <div style={styles.loteSummary}>
                    <div>
                      <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>SKUs no lote</div>
                      <div style={{fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)'}}>
                        {selectedRows.length} / {totalQuantity} {totalQuantity === 1 ? 'etiqueta' : 'etiquetas'}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={rows.length === 0 || generating}
                  style={{width: '100%', marginTop: rows.length > 0 ? '8px' : '0'}}
                >
                  {generating
                    ? <><span className="spinner" style={{width:14,height:14,borderWidth:2}} /> Gerando...</>
                    : <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12l7 7 7-7"/>
                        </svg>
                        Gerar ZPL
                      </>
                  }
                </button>

                {copiedOnGenerate && (
                  <div style={styles.copyFeedback}>
                    ✅ ZPL gerado e copiado para a área de transferência
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      {result && (
        <ZPLOutput
          zpl={result.zpl}
          sku="lote"
          filename="etiquetas_lote"
          count={result.count}
          totalLabels={result.totalLabels}
        />
      )}

      {showImport && (
        <div style={styles.modalOverlay} {...backdropHandlers(backdropDown, () => setShowImport(false))}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{margin: 0, fontSize: '16px'}}>Importar lista</h3>
              <button type="button" onClick={() => setShowImport(false)} style={styles.modalClose}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <p style={{fontSize: '13px', color: 'var(--text-secondary)', marginTop: 0}}>
                Cole da planilha as colunas <b>SKU</b> e <b>quantidade</b> (um por linha). Pode selecionar as duas colunas no Excel e colar aqui.
              </p>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={'SPO11PREBM\t1\nSPO14PREAU\t5\nSPO16PREVS\t3'}
                rows={8}
                style={styles.importArea}
                autoFocus
              />
              {importText.trim() && (
                <div style={styles.importPreview}>
                  <div style={{fontWeight: 700, marginBottom: importNotFound.length ? '8px' : 0}}>
                    <span style={{color: '#276749'}}>{importMatched.length} encontrado{importMatched.length !== 1 ? 's' : ''}</span>
                    {importNotFound.length > 0 && <span style={{color: '#c53030'}}> · {importNotFound.length} não encontrado{importNotFound.length !== 1 ? 's' : ''}</span>}
                    {importIgnoredZero > 0 && <span style={{color: 'var(--text-muted)'}}> · {importIgnoredZero} ignorado{importIgnoredZero !== 1 ? 's' : ''} (qtde 0)</span>}
                  </div>
                  {importNotFound.length > 0 && (
                    <div>
                      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px'}}>
                        <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                          Não estão no catálogo (cadastre em "Gerenciar SKUs"):
                        </span>
                        <button type="button" onClick={() => loadSKUs(true)} disabled={refreshing} style={{...styles.toolBtn, padding: '4px 10px', flexShrink: 0}}>
                          {refreshing ? 'Atualizando...' : 'Atualizar catálogo'}
                        </button>
                      </div>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '5px'}}>
                        {importNotFound.map((c, i) => (
                          <code key={i} style={styles.notFoundChip}>{c}</code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={styles.modalFooter}>
              <button type="button" className="btn-secondary" onClick={() => setShowImport(false)}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={applyImport} disabled={importMatched.length === 0}>
                Adicionar {importMatched.length > 0 ? importMatched.length : ''} ao lote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operador: solicitar inclusão de SKU */}
      {reqForm && (
        <div style={styles.modalOverlay} {...backdropHandlers(backdropDown, () => setReqForm(null))}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Solicitar inclusão de SKU</h3>
              <button type="button" onClick={() => setReqForm(null)} style={styles.modalClose}>✕</button>
            </div>
            <form onSubmit={sendSkuRequest} style={styles.modalBody}>
              {reqErr && <div className="alert alert-error" style={{ marginBottom: '10px' }}>{reqErr}</div>}
              <div className="form-group">
                <label>SKU *</label>
                <input value={reqForm.sku} onChange={e => setReqForm(f => ({ ...f, sku: e.target.value }))}
                  required maxLength={100} style={{ textTransform: 'uppercase' }} autoFocus />
              </div>
              <div className="form-group">
                <label>Título do produto (opcional)</label>
                <input value={reqForm.titulo} onChange={e => setReqForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex.: Antena Shark Carbono" maxLength={300} />
              </div>
              <div className="form-group">
                <label>Localização (opcional)</label>
                <input value={reqForm.local} onChange={e => setReqForm(f => ({ ...f, local: e.target.value }))} maxLength={20} />
              </div>
              <div style={styles.modalFooter}>
                <button type="button" className="btn-secondary" onClick={() => setReqForm(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={reqSaving}>{reqSaving ? 'Enviando...' : 'Enviar solicitação'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin: cadastrar SKU direto */}
      {newSku && (
        <div style={styles.modalOverlay} {...backdropHandlers(backdropDown, () => setNewSku(null))}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Cadastrar SKU</h3>
              <button type="button" onClick={() => setNewSku(null)} style={styles.modalClose}>✕</button>
            </div>
            <form onSubmit={createSku} style={styles.modalBody}>
              {newErr && <div className="alert alert-error" style={{ marginBottom: '10px' }}>{newErr}</div>}
              <div className="form-group">
                <label>SKU *</label>
                <input value={newSku.sku} onChange={e => setNewSku(f => ({ ...f, sku: e.target.value }))} required maxLength={100} style={{ textTransform: 'uppercase' }} />
              </div>
              <div className="form-group">
                <label>Descrição curta</label>
                <input value={newSku.descricao_curta} onChange={e => setNewSku(f => ({ ...f, descricao_curta: e.target.value }))} maxLength={200} autoFocus />
              </div>
              <div className="form-group">
                <label>Descrição curta 2 (alternativa)</label>
                <input value={newSku.descricao_curta_2} onChange={e => setNewSku(f => ({ ...f, descricao_curta_2: e.target.value }))} maxLength={200} />
              </div>
              <div className="form-group">
                <label>Descrição longa</label>
                <input value={newSku.descricao_longa} onChange={e => setNewSku(f => ({ ...f, descricao_longa: e.target.value }))} maxLength={400} />
              </div>
              <div className="form-group">
                <label>Localização</label>
                <input value={newSku.local} onChange={e => setNewSku(f => ({ ...f, local: e.target.value }))} maxLength={20} />
              </div>
              <div className="form-group">
                <label>Medidas da embalagem (envio) — opcional</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {[['comprimento_cm', 'Compr. cm'], ['largura_cm', 'Larg. cm'], ['altura_cm', 'Alt. cm'], ['peso_kg', 'Peso kg']].map(([n, lb]) => (
                    <div key={n}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>{lb}</label>
                      <input type="number" min="0" step="any" value={newSku[n] ?? ''} onChange={e => setNewSku(f => ({ ...f, [n]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" className="btn-secondary" onClick={() => setNewSku(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={newSaving}>{newSaving ? 'Salvando...' : 'Cadastrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
  },
  tablePanel: {
    flex: '1.5',
    minWidth: 0,
  },
  lotePanel: {
    flex: '1',
    minWidth: 0,
  },
  panelTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: '0 0 12px 0',
  },
  searchSection: {
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--border)',
  },
  searchWrapper: {
    position: 'relative',
    marginBottom: '8px',
  },
  searchIcon: {
    position: 'absolute',
    left: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
    pointerEvents: 'none',
  },
  localFilterChips: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  localChip: {
    minWidth: '32px',
    padding: '4px 10px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    background: '#fff',
    color: 'var(--text-secondary)',
    fontSize: '11.5px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.12s',
  },
  localChipActive: {
    background: 'var(--btn-primary)',
    borderColor: 'var(--btn-primary)',
    color: '#fff',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  tableHead: {
    position: 'sticky',
    top: 0,
    background: '#f7fafc',
    borderBottom: '1px solid var(--border)',
  },
  tableRow: {
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.1s',
  },
  colSku: {
    padding: '8px 10px',
    textAlign: 'left',
    fontWeight: '600',
    color: 'var(--text-muted)',
    fontSize: '11px',
    width: '100px',
    flexShrink: 0,
  },
  colDesc: {
    padding: '8px 10px',
    textAlign: 'left',
    fontWeight: '600',
    color: 'var(--text-muted)',
    fontSize: '11px',
    flex: 1,
  },
  colLocal: {
    padding: '8px 10px',
    textAlign: 'center',
    fontWeight: '600',
    color: 'var(--text-muted)',
    fontSize: '11px',
    width: '60px',
    flexShrink: 0,
  },
  colAction: {
    padding: '8px 10px',
    textAlign: 'center',
    width: '90px',
    flexShrink: 0,
  },
  skuCode: {
    background: '#f1f5f9',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'monospace',
    color: '#2b6cb0',
  },
  descPrimary: {
    color: 'var(--text-primary)',
    fontWeight: '500',
  },
  descAlt: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--btn-primary)',
    marginTop: '3px',
  },
  descAltTag: {
    background: 'var(--btn-primary)',
    color: '#fff',
    padding: '1px 6px',
    borderRadius: '10px',
    fontSize: '9.5px',
    fontWeight: '700',
    flexShrink: 0,
  },
  descSecondary: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '2px',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
  },
  badge: {
    background: '#e6fffa',
    color: '#276749',
    padding: '2px 7px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  tableFooter: {
    padding: '10px 12px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    borderTop: '1px solid var(--border)',
  },
  loteHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)',
  },
  loteRow: {
    borderBottom: '1px solid var(--border)',
    padding: '8px 12px',
  },
  cartRow: {
    background: '#f5f8ff',
    borderLeft: '3px solid #2b4c8c',
  },
  cartTag: {
    display: 'inline-block',
    marginRight: '8px',
    fontSize: '10.5px',
    fontWeight: 700,
    color: '#2b4c8c',
    background: '#dbe8ff',
    padding: '2px 8px',
    borderRadius: '10px',
    whiteSpace: 'nowrap',
  },
  loteRowContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  skuCodeInline: {
    background: '#f1f5f9',
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#2b6cb0',
  },
  altToggle: {
    marginLeft: '8px',
    padding: '2px 8px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: '#fff',
    color: 'var(--text-secondary)',
    fontSize: '10.5px',
    fontWeight: '700',
    cursor: 'pointer',
    verticalAlign: 'middle',
  },
  altToggleActive: {
    background: 'var(--btn-primary)',
    borderColor: 'var(--btn-primary)',
    color: '#fff',
  },
  removeBtn: {
    width: '28px',
    height: '28px',
    flexShrink: 0,
    background: '#fff5f5',
    color: '#e53e3e',
    border: '1px solid #fed7d7',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  loteSummary: {
    padding: '12px',
    background: '#f7fafc',
    borderRadius: 'var(--radius-sm)',
    marginBottom: '8px',
  },
  copyFeedback: {
    marginTop: '8px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#276749',
    textAlign: 'center',
  },
  clearBtn: {
    background: '#fff5f5',
    color: '#e53e3e',
    border: '1px solid #fed7d7',
    borderRadius: '6px',
    padding: '5px 12px',
    fontSize: '12.5px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  toolBtn: {
    background: '#fff',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '5px 12px',
    fontSize: '12.5px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  toolBtnActive: {
    background: 'var(--btn-primary)',
    borderColor: 'var(--btn-primary)',
    color: '#fff',
  },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px',
  },
  modalCard: {
    background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '460px',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid var(--border)',
  },
  modalClose: {
    background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)',
  },
  modalBody: { padding: '16px 20px', overflowY: 'auto' },
  modalFooter: {
    display: 'flex', gap: '8px', justifyContent: 'flex-end',
    padding: '14px 20px', borderTop: '1px solid var(--border)',
  },
  importArea: {
    width: '100%', fontFamily: 'monospace', fontSize: '13px', padding: '10px',
    border: '1px solid var(--border)', borderRadius: '8px', resize: 'vertical', boxSizing: 'border-box',
  },
  importPreview: {
    marginTop: '12px', padding: '12px', background: '#f7fafc',
    border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
  },
  notFoundChip: {
    background: '#fff5f5', color: '#c53030', border: '1px solid #fed7d7',
    padding: '2px 7px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace',
  },
};
