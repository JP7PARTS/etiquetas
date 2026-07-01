import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import ZPLOutput from './ZPLOutput.jsx';

export default function GenerateFromSKU() {
  const [skus, setSkus] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    loadSKUs();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(skus);
    } else {
      const q = search.toLowerCase();
      setFiltered(skus.filter(s =>
        s.sku.toLowerCase().includes(q) ||
        (s.descricao_curta && s.descricao_curta.toLowerCase().includes(q)) ||
        (s.descricao_longa && s.descricao_longa.toLowerCase().includes(q))
      ));
    }
  }, [search, skus]);

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadSKUs() {
    setLoading(true);
    try {
      const res = await api.get('/skus');
      setSkus(res.data);
      setFiltered(res.data);
    } catch (err) {
      setError('Erro ao carregar SKUs: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  function selectSKU(sku) {
    setSelected(sku);
    setSearch(sku.sku);
    setDropdownOpen(false);
    setResult(null);
  }

  async function handleGenerate(e) {
    e.preventDefault();
    if (!selected) return;
    setError('');
    setGenerating(true);
    try {
      const res = await api.post('/labels/generate', {
        sku: selected.sku,
        descricao_curta: selected.descricao_curta || '',
        quantity,
      });
      setResult(res.data);
    } catch (err) {
      setError('Erro ao gerar ZPL: ' + (err.response?.data?.error || err.message));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Gerar Etiqueta por SKU</h1>
        <p>Selecione um SKU cadastrado para gerar o código ZPL da etiqueta</p>
      </div>

      <div className="card" style={{maxWidth: '560px'}}>
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleGenerate}>
          <div className="form-group">
            <label>SKU</label>
            <div ref={dropdownRef} style={{position: 'relative'}}>
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setDropdownOpen(true);
                  if (selected && selected.sku !== e.target.value) {
                    setSelected(null);
                    setResult(null);
                  }
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder={loading ? 'Carregando SKUs...' : 'Buscar SKU...'}
                disabled={loading}
                autoComplete="off"
              />
              {dropdownOpen && filtered.length > 0 && (
                <div style={styles.dropdown}>
                  {filtered.slice(0, 50).map(s => (
                    <div
                      key={s.id}
                      style={{
                        ...styles.dropdownItem,
                        ...(selected?.id === s.id ? styles.dropdownItemActive : {}),
                      }}
                      onMouseDown={() => selectSKU(s)}
                    >
                      <div style={styles.skuCode}>{s.sku}</div>
                      {s.descricao_curta && (
                        <div style={styles.skuDesc}>{s.descricao_curta}</div>
                      )}
                    </div>
                  ))}
                  {filtered.length > 50 && (
                    <div style={styles.dropdownMore}>
                      +{filtered.length - 50} resultados. Refine a busca.
                    </div>
                  )}
                </div>
              )}
              {dropdownOpen && !loading && filtered.length === 0 && search && (
                <div style={styles.dropdown}>
                  <div style={styles.dropdownEmpty}>Nenhum SKU encontrado</div>
                </div>
              )}
            </div>
          </div>

          {selected && (
            <div style={styles.selectedInfo}>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>SKU:</span>
                <span style={styles.infoValue}>{selected.sku}</span>
              </div>
              {selected.descricao_longa && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Descrição:</span>
                  <span style={styles.infoValue}>{selected.descricao_longa}</span>
                </div>
              )}
              {selected.descricao_curta && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Desc. curta:</span>
                  <span style={styles.infoValue}>{selected.descricao_curta}</span>
                </div>
              )}
              {selected.local && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Local:</span>
                  <span style={styles.infoValue}>
                    <strong style={{color:'var(--btn-primary)'}}>{selected.local}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="quantity">Quantidade de etiquetas</label>
            <input
              id="quantity"
              type="number"
              min={1}
              max={999}
              value={quantity}
              onChange={e => {
                const v = e.target.value;
                setQuantity(v === '' ? '' : Math.max(1, Math.min(parseInt(v, 10) || 1, 999)));
                setResult(null);
              }}
              onBlur={() => { if (!quantity) setQuantity(1); }}
              style={{maxWidth: '160px'}}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={!selected || generating}
            style={{marginTop: '8px'}}
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
        </form>
      </div>

      {result && (
        <ZPLOutput
          zpl={result.zpl}
          sku={result.sku}
          descricao_curta={result.descricao_curta}
          quantity={result.quantity}
        />
      )}
    </div>
  );
}

const styles = {
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1.5px solid var(--input-focus)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-md)',
    zIndex: 200,
    maxHeight: '260px',
    overflowY: 'auto',
    marginTop: '2px',
  },
  dropdownItem: {
    padding: '10px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.1s',
  },
  dropdownItemActive: {
    background: '#ebf8ff',
  },
  skuCode: {
    fontWeight: '600',
    fontSize: '13px',
    color: 'var(--text-primary)',
    fontFamily: 'monospace',
  },
  skuDesc: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  dropdownEmpty: {
    padding: '14px',
    color: 'var(--text-muted)',
    fontSize: '13px',
    textAlign: 'center',
  },
  dropdownMore: {
    padding: '8px 14px',
    color: 'var(--text-muted)',
    fontSize: '11.5px',
    background: '#f7fafc',
    textAlign: 'center',
  },
  selectedInfo: {
    background: '#f7fafc',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '14px',
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  infoRow: {
    display: 'flex',
    gap: '8px',
    fontSize: '13px',
  },
  infoLabel: {
    color: 'var(--text-muted)',
    minWidth: '80px',
    flexShrink: 0,
  },
  infoValue: {
    color: 'var(--text-primary)',
  },
};
