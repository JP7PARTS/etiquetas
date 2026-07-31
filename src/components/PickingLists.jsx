import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';

function fmtDate(s) { try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; } }

export default function PickingLists({ user }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);      // { id, name, items:[...] } aberta
  const [items, setItems] = useState([]);      // itens da lista aberta
  const [dir, setDir] = useState('asc');       // A→F | F→A
  const [localFilter, setLocalFilter] = useState('');
  const saveTimer = useRef(null);

  useEffect(() => { loadLists(); }, []);

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
      const res = await api.get(`/picking-lists/${id}`);
      setOpen(res.data);
      setItems(Array.isArray(res.data.items) ? res.data.items : []);
      setLocalFilter(''); setDir('asc');
    } catch (err) {
      setError('Erro ao abrir lista: ' + (err.response?.data?.error || err.message));
    }
  }

  function persist(next) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put(`/picking-lists/${open.id}`, { items: next }).catch(() => {});
    }, 500);
  }

  function backToList() {
    clearTimeout(saveTimer.current);
    if (open) api.put(`/picking-lists/${open.id}`, { items }).catch(() => {});
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
  const shownLocais = localFilter ? orderedLocais.filter(l => l === localFilter) : orderedLocais;
  const chips = Array.from(new Set(items.map(it => (it.local || '').trim()).filter(Boolean))).sort();

  const total = items.length;
  const pegos = items.filter(it => it.picked).length;

  function print() {
    const rows = [];
    for (const l of orderedLocais) {
      const its = items.filter(it => (it.local || '') === l);
      if (its.length === 0) continue;
      rows.push(`<tr><td colspan="4" style="background:#eee;font-weight:bold;padding:6px 8px">Local: ${l || 'Sem local'}</td></tr>`);
      for (const it of its.sort((a, b) => a.sku.localeCompare(b.sku))) {
        rows.push(`<tr>
          <td style="text-align:center;border:1px solid #ccc;width:28px">&#9744;</td>
          <td style="border:1px solid #ccc;padding:4px 8px;font-family:monospace">${it.sku}</td>
          <td style="border:1px solid #ccc;padding:4px 8px">${(it.descricao || '').replace(/</g, '&lt;')}</td>
          <td style="border:1px solid #ccc;padding:4px 8px;text-align:center;font-weight:bold">${it.qty}</td>
        </tr>`);
      }
    }
    const html = `<html><head><title>${open.name}</title></head><body style="font-family:Arial,sans-serif">
      <h2>${open.name}</h2>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr>
          <th style="border:1px solid #ccc">✓</th><th style="border:1px solid #ccc">SKU</th>
          <th style="border:1px solid #ccc">Descrição</th><th style="border:1px solid #ccc">Qtde</th>
        </tr></thead><tbody>${rows.join('')}</tbody>
      </table></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  // ================= LISTA DE LISTAS =================
  if (!open) {
    return (
      <div>
        <div className="page-header">
          <h1>Listas de Picking</h1>
          <p>Abra no tablet para separar os produtos por corredor — ou imprima</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {loading ? 'Carregando...' : `${lists.length} lista${lists.length !== 1 ? 's' : ''}`}
            </span>
            <button className="btn-outline" onClick={loadLists}>Atualizar</button>
          </div>
          {loading ? null : lists.length === 0 ? (
            <div className="empty-state"><p>Nenhuma lista salva ainda. Crie uma em "Importar Vendas" (modo Sem carrinho → Salvar lista de picking).</p></div>
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
                  {lists.map(l => {
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
          <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>{pegos} de {total} pegos</div>
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
            <button onClick={() => setLocalFilter('')} style={{ ...styles.chip, ...(localFilter === '' ? styles.chipOn : {}) }}>Todos</button>
            {chips.map(l => (
              <button key={l} onClick={() => setLocalFilter(l === localFilter ? '' : l)}
                style={{ ...styles.chip, ...(localFilter === l ? styles.chipOn : {}) }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Grupos por local */}
        {shownLocais.map(l => {
          const its = items
            .map((it, idx) => ({ it, idx }))
            .filter(x => (x.it.local || '') === l)
            .sort((a, b) => a.it.sku.localeCompare(b.it.sku));
          if (its.length === 0) return null;
          const allPicked = its.every(x => x.it.picked);
          return (
            <div key={l || 'sem'} style={styles.localGroup}>
              <div style={styles.localHeader}>
                <span style={styles.localTitle}>📍 {l || 'Sem local'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({its.filter(x => x.it.picked).length}/{its.length})</span></span>
                <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '12.5px' }}
                  onClick={() => markLocal(l, !allPicked)}>
                  {allPicked ? 'Desmarcar todos' : 'Marcar todos deste local'}
                </button>
              </div>
              {its.map(({ it, idx }) => (
                <div key={idx} onClick={() => toggleItem(idx)}
                  style={{ ...styles.pickRow, ...(it.picked ? styles.pickRowDone : {}) }}>
                  <input type="checkbox" checked={!!it.picked} readOnly style={{ width: '22px', height: '22px', flexShrink: 0, pointerEvents: 'none' }} />
                  <span style={styles.pickQty}>{it.qty}×</span>
                  <code style={styles.code}>{it.sku}</code>
                  <span style={{ flex: 1, color: 'var(--text-secondary)', textDecoration: it.picked ? 'line-through' : 'none' }}>{it.descricao || ''}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
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
};
