import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import { backdropHandlers } from '../utils/backdrop.js';

const emptySku = { sku: '', descricao_curta: '', descricao_curta_2: '', descricao_longa: '', local: '' };

export default function SkuRequests() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [skuForm, setSkuForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [skuErr, setSkuErr] = useState('');
  const backdropDown = useRef(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await api.get('/sku-requests');
      setList(res.data);
    } catch (err) {
      setError('Erro ao carregar solicitações: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  function openCadastro(r) {
    setSkuForm({ ...emptySku, sku: r.sku, descricao_curta: r.titulo || '', local: r.local || '' });
    setSkuErr('');
  }

  async function saveSku(e) {
    e.preventDefault();
    setSaving(true); setSkuErr('');
    try {
      await api.post('/skus', skuForm);   // backend remove a solicitação automaticamente
      setSkuForm(null);
      load();
    } catch (err) {
      if (err.response?.status === 409) { setSkuForm(null); load(); }
      else setSkuErr(err.response?.data?.error || 'Erro ao cadastrar SKU');
    } finally {
      setSaving(false);
    }
  }

  async function dispensar(r) {
    if (!window.confirm(`Dispensar a solicitação do SKU ${r.sku}?`)) return;
    try {
      await api.delete(`/sku-requests/${r.id}`);
      setList(l => l.filter(x => x.id !== r.id));
    } catch (err) {
      setError('Erro ao dispensar: ' + (err.response?.data?.error || err.message));
    }
  }

  function fmtDate(s) { try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; } }

  return (
    <div>
      <div className="page-header">
        <h1>Solicitações de SKU</h1>
        <p>SKUs que os operadores pediram para cadastrar</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {loading ? 'Carregando...' : `${list.length} pendente${list.length !== 1 ? 's' : ''}`}
          </span>
          <button className="btn-outline" onClick={load}>Atualizar</button>
        </div>

        {loading ? null : list.length === 0 ? (
          <div className="empty-state"><p>Nenhuma solicitação pendente 🎉</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Título</th>
                  <th>Local</th>
                  <th>Solicitado por</th>
                  <th>Quando</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id}>
                    <td><code style={styles.code}>{r.sku}</code></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.titulo || '—'}</td>
                    <td>{r.local ? <span style={styles.badge}>{r.local}</span> : '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.requested_by_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontSize: '12.5px' }}>{fmtDate(r.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button className="btn-primary" style={{ padding: '5px 12px' }} onClick={() => openCadastro(r)}>Cadastrar</button>
                        <button className="btn-danger" style={{ padding: '5px 10px' }} onClick={() => dispensar(r)}>Dispensar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {skuForm && (
        <div style={styles.modalOverlay} {...backdropHandlers(backdropDown, () => setSkuForm(null))}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Cadastrar SKU</h3>
              <button type="button" onClick={() => setSkuForm(null)} style={styles.modalClose}>✕</button>
            </div>
            <form onSubmit={saveSku} style={styles.modalBody}>
              {skuErr && <div className="alert alert-error" style={{ marginBottom: '10px' }}>{skuErr}</div>}
              <div className="form-group">
                <label>SKU *</label>
                <input value={skuForm.sku} onChange={e => setSkuForm(f => ({ ...f, sku: e.target.value }))} required maxLength={100} style={{ textTransform: 'uppercase' }} />
              </div>
              <div className="form-group">
                <label>Descrição curta</label>
                <input value={skuForm.descricao_curta} onChange={e => setSkuForm(f => ({ ...f, descricao_curta: e.target.value }))} maxLength={200} />
              </div>
              <div className="form-group">
                <label>Descrição curta 2 (alternativa)</label>
                <input value={skuForm.descricao_curta_2} onChange={e => setSkuForm(f => ({ ...f, descricao_curta_2: e.target.value }))} maxLength={200} />
              </div>
              <div className="form-group">
                <label>Descrição longa</label>
                <input value={skuForm.descricao_longa} onChange={e => setSkuForm(f => ({ ...f, descricao_longa: e.target.value }))} maxLength={400} />
              </div>
              <div className="form-group">
                <label>Localização</label>
                <input value={skuForm.local} onChange={e => setSkuForm(f => ({ ...f, local: e.target.value }))} maxLength={20} />
              </div>
              <div style={styles.modalFooter}>
                <button type="button" className="btn-secondary" onClick={() => setSkuForm(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  code: { background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12.5px', fontFamily: 'monospace', color: '#2b6cb0' },
  badge: { background: '#e6fffa', color: '#276749', padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, fontFamily: 'monospace' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modalCard: { background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '440px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  modalClose: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' },
  modalBody: { padding: '16px 20px', overflowY: 'auto' },
  modalFooter: { display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid var(--border)', marginTop: '4px' },
};
