import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import { backdropHandlers } from '../utils/backdrop.js';

const emptyForm = { nome: '', comprimento_cm: '', largura_cm: '', altura_cm: '' };
const nnum = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const kg = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: n < 1 ? 3 : 1, maximumFractionDigits: 3 });

export default function Embalagens() {
  const backdropDown = useRef(false);
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState(null); // 'create' | 'edit'
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await api.get('/embalagens');
      setLista(res.data);
    } catch (err) {
      setError('Erro ao carregar embalagens: ' + (err.response?.data?.error || err.message));
    } finally { setLoading(false); }
  }

  function msg(m, type = 'success') {
    if (type === 'success') { setSuccess(m); setError(''); } else { setError(m); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 3500);
  }

  function openCreate() { setForm(emptyForm); setEditId(null); setModal('create'); }
  function openEdit(e) {
    setForm({ nome: e.nome || '', comprimento_cm: e.comprimento_cm ?? '', largura_cm: e.largura_cm ?? '', altura_cm: e.altura_cm ?? '' });
    setEditId(e.id); setModal('edit');
  }
  function close() { setModal(null); setForm(emptyForm); setEditId(null); }

  async function salvar(ev) {
    ev.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      if (modal === 'edit' && editId) { await api.put(`/embalagens/${editId}`, form); msg('Embalagem atualizada!'); }
      else { await api.post('/embalagens', form); msg('Embalagem criada!'); }
      close(); load();
    } catch (err) {
      msg(err.response?.data?.error || 'Erro ao salvar', 'error');
    } finally { setSaving(false); }
  }

  async function excluir(id) {
    try { await api.delete(`/embalagens/${id}`); msg('Embalagem excluída!'); setDelId(null); load(); }
    catch (err) { msg(err.response?.data?.error || 'Erro ao excluir', 'error'); }
  }

  const vol = (() => { const c = nnum(form.comprimento_cm), l = nnum(form.largura_cm), a = nnum(form.altura_cm); return (c > 0 && l > 0 && a > 0) ? (c * l * a) / 6000 : null; })();

  return (
    <div>
      <div className="page-header">
        <h1>Embalagens</h1>
        <p>Embalagens padrão (P/M/G) com medidas — usadas para auto-preencher as medidas dos SKUs</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {loading ? 'Carregando...' : `${lista.length} embalagem${lista.length !== 1 ? 's' : ''}`}
          </span>
          <button className="btn-primary" onClick={openCreate}>+ Nova embalagem</button>
        </div>

        {loading ? null : lista.length === 0 ? (
          <div className="empty-state"><p>Nenhuma embalagem cadastrada. Crie as suas (ex.: Saquinho P, Caixa M).</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Nome</th><th>Medidas (C×L×A)</th><th>Peso volumétrico</th><th style={{ textAlign: 'right' }}>Ações</th></tr>
              </thead>
              <tbody>
                {lista.map(e => {
                  const c = nnum(e.comprimento_cm), l = nnum(e.largura_cm), a = nnum(e.altura_cm);
                  const v = (c > 0 && l > 0 && a > 0) ? (c * l * a) / 6000 : null;
                  return (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>{e.nome}</td>
                      <td>{(c != null || l != null || a != null) ? `${[c, l, a].map(x => x != null ? x : '?').join('×')} cm` : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{v != null ? `${kg(v)} kg` : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button className="btn-outline" style={{ padding: '5px 10px' }} onClick={() => openEdit(e)}>Editar</button>
                          <button className="btn-danger" style={{ padding: '5px 10px' }} onClick={() => setDelId(e.id)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div style={styles.overlay} {...backdropHandlers(backdropDown, close)}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: '16px' }}>{modal === 'edit' ? 'Editar embalagem' : 'Nova embalagem'}</h2>
              <button style={styles.closeBtn} onClick={close}>✕</button>
            </div>
            <form onSubmit={salvar} style={{ padding: '22px' }}>
              <div className="form-group">
                <label>Nome *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Saquinho P" maxLength={60} required autoFocus />
              </div>
              <div className="form-group">
                <label>Medidas (cm)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[['comprimento_cm', 'Compr.'], ['largura_cm', 'Larg.'], ['altura_cm', 'Alt.']].map(([n, lb]) => (
                    <div key={n}>
                      <label style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>{lb} (cm)</label>
                      <input type="number" min="0" step="0.1" value={form[n]} onChange={e => setForm(f => ({ ...f, [n]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {vol != null ? <>Peso volumétrico: <b>{kg(vol)} kg</b> (C×L×A ÷ 6000)</> : 'Preencha C, L e A para o peso volumétrico.'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn-secondary" onClick={close}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={!form.nome.trim() || saving}>{saving ? 'Salvando...' : (modal === 'edit' ? 'Salvar' : 'Criar')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {delId && (
        <div style={styles.overlay} {...backdropHandlers(backdropDown, () => setDelId(null))}>
          <div style={{ ...styles.modal, maxWidth: '420px' }}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: '16px' }}>Confirmar exclusão</h2>
              <button style={styles.closeBtn} onClick={() => setDelId(null)}>✕</button>
            </div>
            <div style={{ padding: '22px' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Excluir esta embalagem? Os SKUs que já usam mantêm as medidas copiadas.</p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button className="btn-secondary" onClick={() => setDelId(null)}>Cancelar</button>
                <button className="btn-danger" onClick={() => excluir(delId)}>Sim, excluir</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  modal: { background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid var(--border)' },
  closeBtn: { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' },
};
