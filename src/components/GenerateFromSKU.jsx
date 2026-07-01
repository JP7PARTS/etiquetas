import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import ZPLOutput from './ZPLOutput.jsx';
import { normalizeQuantity, copyZPL } from '../utils/zpl.js';

let rowSeq = 1;
function newRow(sku = null) {
  return { id: rowSeq++, selected: sku, search: sku ? sku.sku : '', quantity: 1 };
}

export default function GenerateFromSKU() {
  const [skus, setSkus] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copiedOnGenerate, setCopiedOnGenerate] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [localFilter, setLocalFilter] = useState('');

  useEffect(() => {
    loadSKUs();
  }, []);

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
      (s.descricao_longa && s.descricao_longa.toLowerCase().includes(q));
    return matchLocal && matchText;
  });

  async function loadSKUs() {
    setLoading(true);
    try {
      const res = await api.get('/skus');
      setSkus(res.data);
    } catch (err) {
      setError('Erro ao carregar SKUs: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
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
        descricao_curta: r.selected.descricao_curta || '',
        quantity: normalizeQuantity(r.quantity),
      }));
      const res = await api.post('/labels/generate-batch', { items });
      setResult(res.data);
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
            <h3 style={styles.panelTitle}>Catálogo de SKUs</h3>

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
                          {sku.descricao_longa && (
                            <div style={styles.descSecondary}>
                              {sku.descricao_longa}
                            </div>
                          )}
                        </td>
                        <td style={styles.colLocal}>
                          {sku.local ? <span style={styles.badge}>{sku.local}</span> : <span style={{color: 'var(--text-muted)'}}>—</span>}
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
            <h3 style={styles.panelTitle}>Seu Lote</h3>

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
                      <div key={row.id} style={styles.loteRow}>
                        <div style={styles.loteRowContent}>
                          <span style={{flex: 1}}>
                            {row.selected ? (
                              <>
                                <code style={styles.skuCodeInline}>{row.selected.sku}</code>
                                <span style={{fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px'}}>
                                  {row.selected.descricao_curta}
                                </span>
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
};
