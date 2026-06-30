import React, { useState } from 'react';
import api from '../utils/api.js';
import ZPLOutput from './ZPLOutput.jsx';

export default function GenerateCustom() {
  const [sku, setSku] = useState('');
  const [descricao, setDescricao] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!sku.trim()) return;
    setError('');
    setGenerating(true);
    try {
      const res = await api.post('/labels/generate', {
        sku: sku.trim(),
        descricao_curta: descricao.trim(),
      });
      setResult(res.data);
    } catch (err) {
      setError('Erro ao gerar ZPL: ' + (err.response?.data?.error || err.message));
    } finally {
      setGenerating(false);
    }
  }

  function handleClear() {
    setSku('');
    setDescricao('');
    setResult(null);
    setError('');
  }

  const skuLen = sku.trim().length;
  const moduleWidth = skuLen <= 10 ? 3 : skuLen <= 15 ? 2 : 1;

  return (
    <div>
      <div className="page-header">
        <h1>Gerar Etiqueta Personalizada</h1>
        <p>Insira SKU e descrição manualmente para gerar o código ZPL</p>
      </div>

      <div className="card" style={{maxWidth: '560px'}}>
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="sku">SKU *</label>
            <input
              id="sku"
              type="text"
              value={sku}
              onChange={e => { setSku(e.target.value.toUpperCase()); setResult(null); }}
              placeholder="Ex.: JP7-001"
              maxLength={50}
              required
            />
            {skuLen > 0 && (
              <div style={styles.hint}>
                {skuLen} caracteres · Largura do módulo: {moduleWidth}
                {skuLen > 15 && ' ⚠️ SKU longo, barras finas'}
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="descricao">Descrição curta (linha superior)</label>
            <input
              id="descricao"
              type="text"
              value={descricao}
              onChange={e => { setDescricao(e.target.value); setResult(null); }}
              placeholder="Ex.: Parafuso M8x30"
              maxLength={100}
            />
            <div style={styles.hint}>
              {descricao.length}/100 chars · Se vazio, usa o próprio SKU
            </div>
          </div>

          <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
            <button
              type="submit"
              className="btn-primary"
              disabled={!sku.trim() || generating}
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
            {(sku || descricao || result) && (
              <button type="button" className="btn-secondary" onClick={handleClear}>
                Limpar
              </button>
            )}
          </div>
        </form>
      </div>

      {result && (
        <ZPLOutput
          zpl={result.zpl}
          sku={result.sku}
          descricao_curta={result.descricao_curta}
        />
      )}
    </div>
  );
}

const styles = {
  hint: {
    marginTop: '4px',
    fontSize: '11.5px',
    color: 'var(--text-muted)',
  },
};
