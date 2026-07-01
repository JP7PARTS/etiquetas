import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import ZPLOutput from './ZPLOutput.jsx';
import { normalizeQuantity } from '../utils/zpl.js';

let rowSeq = 1;
function newRow() {
  return { id: rowSeq++, selected: null, search: '', quantity: 1 };
}

export default function GenerateFromSKU() {
  const [skus, setSkus] = useState([]);
  const [rows, setRows] = useState([newRow()]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadSKUs();
  }, []);

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

  function addRow() {
    setRows(rows => [...rows, newRow()]);
    setResult(null);
  }

  function removeRow(id) {
    setRows(rows => (rows.length > 1 ? rows.filter(r => r.id !== id) : rows));
    setResult(null);
  }

  const selectedRows = rows.filter(r => r.selected);

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
        <p>Monte uma lista de SKUs cadastrados, defina a quantidade de cada um e gere um único arquivo ZPL</p>
      </div>

      <div className="card" style={{maxWidth: '640px'}}>
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleGenerate}>
          <div style={styles.rowsHeader}>
            <span style={{...styles.colLabel, flex: 1}}>SKU</span>
            <span style={{...styles.colLabel, width: '90px'}}>Qtde</span>
            <span style={{width: '34px'}} />
          </div>

          {rows.map(row => (
            <SkuRow
              key={row.id}
              row={row}
              skus={skus}
              loading={loading}
              canRemove={rows.length > 1}
              onChange={patch => updateRow(row.id, patch)}
              onRemove={() => removeRow(row.id)}
            />
          ))}

          <button
            type="button"
            className="btn-outline"
            onClick={addRow}
            style={{marginTop: '8px'}}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Adicionar SKU
          </button>

          <div style={styles.summary}>
            {selectedRows.length > 0
              ? `${selectedRows.length} SKU(s) selecionado(s) · ${selectedRows.reduce((s, r) => s + normalizeQuantity(r.quantity), 0)} etiqueta(s)`
              : 'Selecione ao menos um SKU'}
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={selectedRows.length === 0 || generating}
            style={{marginTop: '4px'}}
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
          sku="lote"
          filename="etiquetas_lote"
          count={result.count}
          totalLabels={result.totalLabels}
        />
      )}
    </div>
  );
}

function SkuRow({ row, skus, loading, canRemove, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const q = row.search.trim().toLowerCase();
  const filtered = !q
    ? skus
    : skus.filter(s =>
        s.sku.toLowerCase().includes(q) ||
        (s.descricao_curta && s.descricao_curta.toLowerCase().includes(q)) ||
        (s.descricao_longa && s.descricao_longa.toLowerCase().includes(q))
      );

  function selectSKU(s) {
    onChange({ selected: s, search: s.sku });
    setOpen(false);
  }

  return (
    <div style={styles.row}>
      <div ref={ref} style={{position: 'relative', flex: 1}}>
        <input
          type="text"
          value={row.search}
          onChange={e => {
            const v = e.target.value;
            onChange({ search: v, selected: row.selected && row.selected.sku === v ? row.selected : null });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Carregando...' : 'Buscar SKU...'}
          disabled={loading}
          autoComplete="off"
          style={row.selected ? styles.inputSelected : undefined}
        />
        {open && filtered.length > 0 && (
          <div style={styles.dropdown}>
            {filtered.slice(0, 50).map(s => (
              <div
                key={s.id}
                style={{
                  ...styles.dropdownItem,
                  ...(row.selected?.id === s.id ? styles.dropdownItemActive : {}),
                }}
                onMouseDown={() => selectSKU(s)}
              >
                <div style={styles.skuCode}>{s.sku}</div>
                {s.descricao_curta && <div style={styles.skuDesc}>{s.descricao_curta}</div>}
              </div>
            ))}
            {filtered.length > 50 && (
              <div style={styles.dropdownMore}>+{filtered.length - 50} resultados. Refine a busca.</div>
            )}
          </div>
        )}
        {open && !loading && filtered.length === 0 && row.search && (
          <div style={styles.dropdown}>
            <div style={styles.dropdownEmpty}>Nenhum SKU encontrado</div>
          </div>
        )}
      </div>

      <input
        type="number"
        min={1}
        max={999}
        value={row.quantity}
        onChange={e => {
          const v = e.target.value;
          onChange({ quantity: v === '' ? '' : Math.max(1, Math.min(parseInt(v, 10) || 1, 999)) });
        }}
        onBlur={() => { if (!row.quantity) onChange({ quantity: 1 }); }}
        style={{width: '90px'}}
      />

      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        title="Remover"
        style={{...styles.removeBtn, ...(canRemove ? {} : styles.removeBtnDisabled)}}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

const styles = {
  rowsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  colLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '8px',
  },
  inputSelected: {
    borderColor: 'var(--btn-primary)',
    background: '#f0fbff',
  },
  removeBtn: {
    width: '34px',
    height: '38px',
    flexShrink: 0,
    background: '#fff5f5',
    color: '#e53e3e',
    border: '1px solid #fed7d7',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  summary: {
    fontSize: '12.5px',
    color: 'var(--text-muted)',
    margin: '14px 0 10px',
  },
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
};
