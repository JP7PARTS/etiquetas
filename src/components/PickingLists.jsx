import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import { backdropHandlers } from '../utils/backdrop.js';

function fmtDate(s) { try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; } }

const emptySku = { sku: '', descricao_curta: '', descricao_curta_2: '', descricao_longa: '', local: '' };

export default function PickingLists({ user }) {
  const isAdmin = user?.role === 'admin';
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);      // { id, name, items:[...] } aberta
  const [items, setItems] = useState([]);      // itens da lista aberta
  const [dir, setDir] = useState('asc');       // A→F | F→A
  const [localFilter, setLocalFilter] = useState('ALL'); // ALL | __none__ | <local>
  const [onlyPending, setOnlyPending] = useState(false); // só não pegos
  const [catalog, setCatalog] = useState(new Map()); // code(UPPER) -> skuObj (para "sem cadastro" + auto-atualizar)
  const [skuForm, setSkuForm] = useState(null);   // admin: cadastrar SKU direto
  const [savingSku, setSavingSku] = useState(false);
  const [skuErr, setSkuErr] = useState('');
  const [reqForm, setReqForm] = useState(null);   // operador: solicitar cadastro
  const [reqSaving, setReqSaving] = useState(false);
  const [reqErr, setReqErr] = useState('');
  const [requested, setRequested] = useState(new Set()); // SKUs já solicitados nesta sessão
  const [tab, setTab] = useState('ativas'); // ativas | concluidas (lista de listas)
  const saveTimer = useRef(null);
  const backdropDown = useRef(false);
  const lastUpdatedAt = useRef(null); // token de versão da lista aberta (controle de concorrência)

  useEffect(() => { loadLists(); }, []);

  async function fetchCatalog() {
    try { const r = await api.get('/skus'); return new Map(r.data.map(s => [s.sku.toUpperCase(), s])); }
    catch { return new Map(); }
  }

  // Preenche descrição/local a partir do catálogo (SKU cadastrado depois de salvar a lista)
  function mergeItems(raw, cat) {
    let changed = false;
    const merged = raw.map(it => {
      const s = cat.get(String(it.sku).toUpperCase());
      if (!s) return it;
      const descricao = s.descricao_curta || '';
      const local = s.local || '';
      if (descricao !== (it.descricao || '') || local !== (it.local || '')) changed = true;
      return { ...it, descricao, local };
    });
    return { merged, changed };
  }

  // Salva itens (best-effort). Controle de conflito desativado por enquanto.
  async function savePut(id, next) {
    try {
      const res = await api.put(`/picking-lists/${id}`, { items: next });
      if (res.data?.updated_at) lastUpdatedAt.current = res.data.updated_at;
    } catch { /* ignora falha de rede */ }
  }

  // Recarrega o catálogo e re-mescla a lista aberta (item "sem cadastro" vira normal ao ser cadastrado)
  async function refreshCatalogMerge() {
    if (!open) return;
    const cat = await fetchCatalog();
    setCatalog(cat);
    setItems(prev => {
      const { merged, changed } = mergeItems(prev, cat);
      if (changed) savePut(open.id, merged);
      return merged;
    });
  }

  useEffect(() => {
    if (!open) return;
    const onFocus = () => { refreshCatalogMerge().catch(() => {}); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [open]);

  async function saveSku(e) {
    e.preventDefault();
    setSavingSku(true); setSkuErr('');
    try {
      await api.post('/skus', skuForm);
      await refreshCatalogMerge();
      setSkuForm(null);
    } catch (err) {
      if (err.response?.status === 409) { await refreshCatalogMerge(); setSkuForm(null); }
      else setSkuErr(err.response?.data?.error || 'Erro ao cadastrar SKU');
    } finally {
      setSavingSku(false);
    }
  }

  async function sendRequest(e) {
    e.preventDefault();
    setReqSaving(true); setReqErr('');
    try {
      await api.post('/sku-requests', reqForm);
      setRequested(prev => new Set(prev).add(reqForm.sku.toUpperCase()));
      setReqForm(null);
    } catch (err) {
      setReqErr(err.response?.data?.error || 'Erro ao enviar solicitação');
    } finally {
      setReqSaving(false);
    }
  }

  async function loadLists() {
    setLoading(true); setError('');
    try {
      const res = await api.get('/picking-lists');
      setLists(res.data);
    } catch (err) {
      setError('Erro ao carregar listas: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  async function openList(id) {
    try {
      const [res, cat] = await Promise.all([api.get(`/picking-lists/${id}`), fetchCatalog()]);
      setCatalog(cat);
      const raw = Array.isArray(res.data.items) ? res.data.items : [];
      const { merged, changed } = mergeItems(raw, cat);
      lastUpdatedAt.current = res.data.updated_at || null;
      setOpen(res.data);
      setItems(merged);
      setLocalFilter('ALL'); setDir('asc'); setOnlyPending(false);
      if (changed) savePut(id, merged);
    } catch (err) {
      setError('Erro ao abrir lista: ' + (err.response?.data?.error || err.message));
    }
  }

  function persist(next) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { savePut(open.id, next); }, 500);
  }

  function backToList() {
    clearTimeout(saveTimer.current);
    if (open) savePut(open.id, items);
    setOpen(null);
    loadLists();
  }

  function toggleItem(idx) {
    setItems(prev => {
      const next = prev.map((it, i) => i === idx ? { ...it, picked: !it.picked } : it);
      persist(next);
      return next;
    });
  }

  function markLocal(local, value) {
    setItems(prev => {
      const next = prev.map(it => (it.local || '') === local ? { ...it, picked: value } : it);
      persist(next);
      return next;
    });
  }

  async function remove(l) {
    if (!window.confirm(`Excluir a lista "${l.name}"?`)) return;
    try {
      await api.delete(`/picking-lists/${l.id}`);
      setLists(ls => ls.filter(x => x.id !== l.id));
    } catch (err) {
      setError('Erro ao excluir: ' + (err.response?.data?.error || err.message));
    }
  }

  // ---- Agrupamento por local (para a lista aberta) ----
  const locais = Array.from(new Set(items.map(it => (it.local || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b) * (dir === 'asc' ? 1 : -1));
  const semLocal = items.some(it => !(it.local || '').trim());
  const orderedLocais = [...locais, ...(semLocal ? [''] : [])];
  const shownLocais = localFilter === 'ALL' ? orderedLocais
    : localFilter === '__none__' ? ['']
    : orderedLocais.filter(l => l === localFilter);
  const chips = Array.from(new Set(items.map(it => (it.local || '').trim()).filter(Boolean))).sort();

  const total = items.length;
  const pegos = items.filter(it => it.picked).length;
  const qtyOf = it => Math.max(1, parseInt(it.qty, 10) || 1);
  const pecasTotal = items.reduce((s, it) => s + qtyOf(it), 0);
  const pecasPegas = items.filter(it => it.picked).reduce((s, it) => s + qtyOf(it), 0);

  function print() {
    const rows = [];
    for (const l of orderedLocais) {
      const its = items.filter(it => (it.local || '') === l);
      if (its.length === 0) continue;
      rows.push(`<tr><td colspan="4" style="background:#eee;font-weight:bold;padding:6px 8px">Local: ${l || 'Sem local'}</td></tr>`);
      for (const it of its.sort((a, b) => a.sku.localeCompare(b.sku))) {
        rows.push(`<tr>
          <td style="text-align:center;border:1px solid #ccc;width:28px">&#9744;</td>
          <td style="border:1px solid #ccc;padding:4px 8px;font-family:monospace;white-space:nowrap">${it.sku}</td>
          <td style="border:1px solid #ccc;padding:4px 8px;text-align:center;font-weight:bold;width:48px">${it.qty}</td>
          <td style="border:1px solid #ccc;padding:4px 8px">${(it.descricao || (catalog.has(String(it.sku).toUpperCase()) ? '' : 'sem cadastro')).replace(/</g, '&lt;')}</td>
        </tr>`);
      }
    }
    const html = `<html><head><title>${open.name}</title></head><body style="font-family:Arial,sans-serif">
      <h2>${open.name}</h2>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr>
          <th style="border:1px solid #ccc">✓</th><th style="border:1px solid #ccc">SKU</th>
          <th style="border:1px solid #ccc">Qtde</th><th style="border:1px solid #ccc">Descrição</th>
        </tr></thead><tbody>${rows.join('')}</tbody>
      </table></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  // ================= LISTA DE LISTAS =================
  const isDone = l => Number(l.total) > 0 && Number(l.pegos) >= Number(l.total);
  const doneLists = lists.filter(isDone);
  const activeLists = lists.filter(l => !isDone(l));
  const shownLists = tab === 'concluidas' ? doneLists : activeLists;
  if (!open) {
    return (
      <div>
        <div className="page-header">
          <h1>Listas de Picking</h1>
          <p>Abra no tablet para separar os produtos por corredor — ou imprima</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setTab('ativas')} style={{ ...styles.chip, ...(tab === 'ativas' ? styles.chipOn : {}) }}>Ativas ({activeLists.length})</button>
              <button onClick={() => setTab('concluidas')} style={{ ...styles.chip, ...(tab === 'concluidas' ? styles.chipOn : {}) }}>Concluídas ({doneLists.length})</button>
            </div>
            <button className="btn-outline" onClick={loadLists}>Atualizar</button>
          </div>
          {loading ? null : shownLists.length === 0 ? (
            <div className="empty-state"><p>{lists.length === 0
              ? 'Nenhuma lista salva ainda. Crie uma em "Importar Vendas" (modo Sem carrinho → Salvar lista de picking).'
              : tab === 'ativas' ? 'Nenhuma lista ativa — todas foram concluídas.' : 'Nenhuma lista concluída ainda.'}</p></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Nome</th><th>Progresso</th><th>Criada por</th><th>Quando</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {shownLists.map(l => {
                    const pct = l.total > 0 ? Math.round((l.pegos / l.total) * 100) : 0;
                    return (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 600 }}>{l.name}</td>
                        <td>
                          <div style={styles.progWrap}>
                            <div style={{ ...styles.progFill, width: `${pct}%`, background: pct === 100 ? '#38a169' : 'var(--btn-primary)' }} />
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{l.pegos}/{l.total} pegos</span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{l.created_by_name || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '12.5px', color: 'var(--text-muted)' }}>{fmtDate(l.created_at)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="btn-primary" style={{ padding: '5px 12px' }} onClick={() => openList(l.id)}>Abrir</button>
                            {(user?.role === 'admin' || l.created_by === user?.id) && (
                              <button className="btn-danger" style={{ padding: '5px 10px' }} onClick={() => remove(l)}>Excluir</button>
                            )}
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
      </div>
    );
  }

  // ================= LISTA ABERTA (PICKING) =================
  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button className="btn-outline" style={{ padding: '6px 12px' }} onClick={backToList}>← Voltar</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0 }}>{open.name}</h1>
        </div>
        <button className="btn-outline" onClick={print}>🖨️ Imprimir</button>
      </div>

      <div className="card">
        {/* Progresso */}
        <div style={{ marginBottom: '14px' }}>
          <div style={styles.progWrapBig}>
            <div style={{ ...styles.progFill, width: `${total ? Math.round(pegos / total * 100) : 0}%`, background: pegos === total && total > 0 ? '#38a169' : 'var(--btn-primary)' }} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>
            {pegos} de {total} itens
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {pecasPegas}/{pecasTotal} peças</span>
          </div>
        </div>

        {/* Controles: direção + filtro de local */}
        <div style={styles.controls}>
          <div style={styles.group}>
            <span style={styles.groupLabel}>Corredor</span>
            <button onClick={() => setDir('asc')} style={{ ...styles.chip, ...(dir === 'asc' ? styles.chipOn : {}) }}>A → F</button>
            <button onClick={() => setDir('desc')} style={{ ...styles.chip, ...(dir === 'desc' ? styles.chipOn : {}) }}>F → A</button>
          </div>
          <div style={styles.group}>
            <span style={styles.groupLabel}>Filtrar local</span>
            <button onClick={() => setLocalFilter('ALL')} style={{ ...styles.chip, ...(localFilter === 'ALL' ? styles.chipOn : {}) }}>Todos</button>
            {chips.map(l => (
              <button key={l} onClick={() => setLocalFilter(l === localFilter ? 'ALL' : l)}
                style={{ ...styles.chip, ...(localFilter === l ? styles.chipOn : {}) }}>{l}</button>
            ))}
            {semLocal && (
              <button onClick={() => setLocalFilter(localFilter === '__none__' ? 'ALL' : '__none__')}
                style={{ ...styles.chip, ...(localFilter === '__none__' ? styles.chipOn : {}) }}>Sem local</button>
            )}
          </div>
          <div style={styles.group}>
            <button onClick={() => setOnlyPending(v => !v)}
              style={{ ...styles.chip, ...(onlyPending ? styles.chipOn : {}) }}>
              {onlyPending ? '✓ ' : ''}Só faltantes ({total - pegos})
            </button>
          </div>
        </div>

        {/* Grupos por local */}
        {shownLocais.map(l => {
          const its = items
            .map((it, idx) => ({ it, idx }))
            .filter(x => (x.it.local || '') === l && (!onlyPending || !x.it.picked))
            .sort((a, b) => a.it.sku.localeCompare(b.it.sku));
          if (its.length === 0) return null;
          const allPicked = its.every(x => x.it.picked);
          return (
            <div key={l || 'sem'} style={styles.localGroup}>
              <div style={styles.localHeader}>
                <span style={styles.localTitle}>📍 {l || 'Sem local'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({its.filter(x => x.it.picked).length}/{its.length} itens · {its.reduce((s, x) => s + qtyOf(x.it), 0)} peças)</span></span>
                <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '12.5px' }}
                  onClick={() => markLocal(l, !allPicked)}>
                  {allPicked ? 'Desmarcar todos' : 'Marcar todos deste local'}
                </button>
              </div>
              {its.map(({ it, idx }) => {
                const missing = !catalog.has(String(it.sku).toUpperCase());
                return (
                  <div key={idx} onClick={() => toggleItem(idx)}
                    style={{ ...styles.pickRow, ...(it.picked ? styles.pickRowDone : {}) }}>
                    <input type="checkbox" checked={!!it.picked} readOnly style={{ width: '22px', height: '22px', flexShrink: 0, pointerEvents: 'none' }} />
                    <span style={styles.pickQty}>{it.qty}×</span>
                    <code style={styles.code}>{it.sku}</code>
                    <span style={{ flex: 1, color: 'var(--text-secondary)', textDecoration: it.picked ? 'line-through' : 'none' }}>
                      {missing ? <span style={styles.semTag}>sem cadastro</span> : (it.descricao || '')}
                    </span>
                    {missing && (
                      requested.has(String(it.sku).toUpperCase()) ? (
                        <span style={styles.reqDone}>Solicitado ✓</span>
                      ) : isAdmin ? (
                        <button className="btn-outline" style={styles.rowBtn}
                          onClick={e => { e.stopPropagation(); setSkuErr(''); setSkuForm({ ...emptySku, sku: it.sku, local: it.local || '' }); }}>
                          Cadastrar
                        </button>
                      ) : (
                        <button className="btn-outline" style={styles.rowBtn}
                          onClick={e => { e.stopPropagation(); setReqErr(''); setReqForm({ sku: it.sku, titulo: it.descricao || '', local: it.local || '' }); }}>
                          Solicitar
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
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
                <input value={skuForm.sku} onChange={e => setSkuForm(f => ({ ...f, sku: e.target.value }))}
                  required maxLength={100} style={{ textTransform: 'uppercase' }} />
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
                <button type="submit" className="btn-primary" disabled={savingSku}>
                  {savingSku ? 'Salvando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reqForm && (
        <div style={styles.modalOverlay} {...backdropHandlers(backdropDown, () => setReqForm(null))}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Solicitar cadastro ao admin</h3>
              <button type="button" onClick={() => setReqForm(null)} style={styles.modalClose}>✕</button>
            </div>
            <form onSubmit={sendRequest} style={styles.modalBody}>
              {reqErr && <div className="alert alert-error" style={{ marginBottom: '10px' }}>{reqErr}</div>}
              <div className="form-group">
                <label>SKU</label>
                <input value={reqForm.sku} readOnly style={{ background: '#f7fafc' }} />
              </div>
              <div className="form-group">
                <label>Título do produto (opcional)</label>
                <input value={reqForm.titulo} onChange={e => setReqForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ex.: Pedaleira BM F30" maxLength={300} autoFocus />
              </div>
              <div className="form-group">
                <label>Localização (opcional)</label>
                <input value={reqForm.local} onChange={e => setReqForm(f => ({ ...f, local: e.target.value }))} maxLength={20} />
              </div>
              <div style={styles.modalFooter}>
                <button type="button" className="btn-secondary" onClick={() => setReqForm(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={reqSaving}>
                  {reqSaving ? 'Enviando...' : 'Enviar solicitação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  progWrap: { height: '8px', background: '#edf2f7', borderRadius: '4px', overflow: 'hidden', marginBottom: '3px', maxWidth: '180px' },
  progWrapBig: { height: '12px', background: '#edf2f7', borderRadius: '6px', overflow: 'hidden' },
  progFill: { height: '100%', transition: 'width 0.2s' },
  controls: { display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' },
  group: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  groupLabel: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 },
  chip: { padding: '6px 12px', borderRadius: '16px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'var(--btn-primary)', borderColor: 'var(--btn-primary)', color: '#fff' },
  localGroup: { marginBottom: '18px' },
  localHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '6px 4px', borderBottom: '2px solid var(--border)', marginBottom: '4px' },
  localTitle: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' },
  pickRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none' },
  pickRowDone: { background: '#f0fff4', opacity: 0.7 },
  pickQty: { fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: '34px' },
  code: { background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace', color: '#2b6cb0' },
  semTag: { fontSize: '11px', fontWeight: 700, color: '#9a6a00', background: '#fff4e0', padding: '2px 8px', borderRadius: '10px' },
  rowBtn: { padding: '4px 12px', fontSize: '12.5px', flexShrink: 0 },
  reqDone: { fontSize: '12px', fontWeight: 700, color: '#276749', flexShrink: 0 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modalCard: { background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '440px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  modalClose: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' },
  modalBody: { padding: '16px 20px', overflowY: 'auto' },
  modalFooter: { display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid var(--border)', marginTop: '4px' },
};
