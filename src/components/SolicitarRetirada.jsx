import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api.js';

// Solicitar Retirada: worklist de devoluções do Full. Adiciona itens (um por vez),
// seleciona vários e "reclama" gerando um protocolo que agrupa os itens num bloco,
// acompanhado até resolvido / não resolvido. Motivos e justificativas são editáveis.

const casoLink = (p) => `https://www.mercadolivre.com.br/cases/detail/${p}`;
const STATUS_BLOCO = {
  em_acompanhamento: { label: 'Em acompanhamento', bg: 'var(--color-info-bg)', fg: 'var(--color-info-fg)' },
  resolvido: { label: 'Resolvido ✓', bg: 'var(--color-success-bg)', fg: 'var(--color-success-fg)' },
  nao_resolvido: { label: 'Não resolvido', bg: 'var(--color-error-bg)', fg: 'var(--color-error-fg)' },
};
const CUSTOM = '__custom__';
const emptyForm = { qtd: 1, sku: '', bling: '', ml: '', motivo: '', motivoCustom: '', justificativa: '', justCustom: '' };
// Prepara o form a partir de um item existente: se o texto não está na lista de opções, vira "Personalizado".
function formFromItem(it, motivos, justificativas) {
  const inList = (arr, txt) => arr.some(o => o.texto === txt);
  return {
    qtd: it.qtd, sku: it.sku || '', bling: it.bling || '', ml: it.ml || '',
    motivo: it.motivo && !inList(motivos, it.motivo) ? CUSTOM : (it.motivo || ''),
    motivoCustom: it.motivo && !inList(motivos, it.motivo) ? it.motivo : '',
    justificativa: it.justificativa && !inList(justificativas, it.justificativa) ? CUSTOM : (it.justificativa || ''),
    justCustom: it.justificativa && !inList(justificativas, it.justificativa) ? it.justificativa : '',
  };
}

// Texto formatado para copiar (estilo da planilha de origem)
function formatBloco(itens, titulo = 'SOLICITAR RETIRADA -') {
  const linhas = [titulo, ['qtd', 'sku', 'n bling / n ml', 'motivo', 'justificativa'].join('\t')];
  for (const it of itens) {
    linhas.push([it.qtd, it.sku, `${it.bling || ''} - ${it.ml || ''} - ${it.motivo || ''}`, it.justificativa || ''].join('\t'));
  }
  return linhas.join('\n');
}

export default function SolicitarRetirada() {
  const [itens, setItens] = useState([]);
  const [opcoes, setOpcoes] = useState([]);
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);   // id do item em edição (null = adicionando)
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [gerenciar, setGerenciar] = useState(false);
  const [novaOpcao, setNovaOpcao] = useState({ motivo: '', justificativa: '' });
  const [motivoFiltro, setMotivoFiltro] = useState(new Set()); // filtro da lista "A reclamar"
  const [justFiltro, setJustFiltro] = useState(new Set());     // filtro por justificativa
  const [busca, setBusca] = useState('');                      // busca por SKU / Bling / ML
  const [tip, setTip] = useState(null);                        // aviso flutuante "Copiado!" {x,y}

  useEffect(() => { load(); api.get('/skus').then(r => setSkus(r.data || [])).catch(() => {}); }, []);
  async function load() {
    setLoading(true); setError('');
    try { const r = await api.get('/retirada'); setItens(r.data.itens || []); setOpcoes(r.data.opcoes || []); }
    catch (e) { setError('Erro ao carregar: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  }
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  const motivos = useMemo(() => opcoes.filter(o => o.tipo === 'motivo'), [opcoes]);
  const justificativas = useMemo(() => opcoes.filter(o => o.tipo === 'justificativa'), [opcoes]);
  const pendentesTodos = useMemo(() => itens.filter(i => !i.protocolo), [itens]);
  const motivoCount = useMemo(() => {
    const m = {}; for (const i of pendentesTodos) { const t = (i.motivo || '').trim() || '(sem motivo)'; m[t] = (m[t] || 0) + 1; } return m;
  }, [pendentesTodos]);
  const justCount = useMemo(() => {
    const m = {}; for (const i of pendentesTodos) { const t = (i.justificativa || '').trim() || '(sem justificativa)'; m[t] = (m[t] || 0) + 1; } return m;
  }, [pendentesTodos]);
  const pendentes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pendentesTodos.filter(i =>
      (!motivoFiltro.size || motivoFiltro.has((i.motivo || '').trim() || '(sem motivo)')) &&
      (!justFiltro.size || justFiltro.has((i.justificativa || '').trim() || '(sem justificativa)')) &&
      (!q || [i.sku, i.bling, i.ml].some(v => String(v || '').toLowerCase().includes(q)))
    );
  }, [pendentesTodos, motivoFiltro, justFiltro, busca]);
  const toggleMotivo = (t) => setMotivoFiltro(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const toggleJust = (t) => setJustFiltro(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const blocos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const match = (i) => !q || [i.sku, i.bling, i.ml].some(v => String(v || '').toLowerCase().includes(q));
    const m = new Map();
    for (const i of itens) if (i.protocolo && match(i)) { if (!m.has(i.protocolo)) m.set(i.protocolo, []); m.get(i.protocolo).push(i); }
    return [...m.entries()].map(([protocolo, its]) => ({ protocolo, status: its[0].status || 'em_acompanhamento', itens: its }));
  }, [itens, busca]);

  async function submitItem(e) {
    e.preventDefault();
    const motivo = form.motivo === CUSTOM ? form.motivoCustom.trim() : form.motivo;
    const justificativa = form.justificativa === CUSTOM ? form.justCustom.trim() : form.justificativa;
    if (!form.sku.trim()) { setError('Informe o SKU'); return; }
    setSaving(true); setError('');
    const payload = { qtd: form.qtd, sku: form.sku, bling: form.bling, ml: form.ml, motivo, justificativa };
    try {
      if (editId) {
        const r = await api.put(`/retirada/itens/${editId}`, payload);
        setItens(prev => prev.map(i => i.id === editId ? r.data : i));
        setEditId(null); setForm(emptyForm);
      } else {
        const r = await api.post('/retirada/itens', payload);
        setItens(prev => [r.data, ...prev]);
        setForm(f => ({ ...emptyForm, motivo: f.motivo, motivoCustom: f.motivoCustom, justificativa: f.justificativa, justCustom: f.justCustom })); // mantém motivo/justif
      }
    } catch (e) { setError('Erro ao salvar: ' + (e.response?.data?.error || e.message)); }
    finally { setSaving(false); }
  }
  function startEdit(it) {
    setEditId(it.id); setForm(formFromItem(it, motivos, justificativas)); setError('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cancelEdit() { setEditId(null); setForm(emptyForm); }
  async function marcarStatus(ids, status) {
    if (!ids.length) return;
    try {
      const r = await api.post('/retirada/itens/status', { ids, status });
      const byId = new Map(r.data.itens.map(i => [i.id, i]));
      setItens(prev => prev.map(i => byId.get(i.id) || i));
      setSel(new Set());
    } catch (e) { setError('Erro ao atualizar status: ' + (e.response?.data?.error || e.message)); }
  }
  async function delItem(id) {
    try { await api.delete(`/retirada/itens/${id}`); setItens(prev => prev.filter(i => i.id !== id)); setSel(s => { const n = new Set(s); n.delete(id); return n; }); }
    catch (e) { setError('Erro ao remover: ' + (e.response?.data?.error || e.message)); }
  }
  const toggleSel = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function reclamar() {
    const pendIds = new Set(pendentesTodos.map(i => i.id));
    const ids = [...sel].filter(id => pendIds.has(id));
    if (!ids.length) return;
    const protocolo = window.prompt(`Número do protocolo para as ${ids.length} venda(s) selecionada(s):`);
    if (protocolo == null || !protocolo.trim()) return;
    try {
      const r = await api.post('/retirada/reclamar', { ids, protocolo: protocolo.trim() });
      // aplica: marca protocolo/status nos itens retornados
      const byId = new Map(r.data.itens.map(i => [i.id, i]));
      setItens(prev => prev.map(i => byId.get(i.id) || i));
      setSel(new Set());
      flash(`✅ ${r.data.atualizados} venda(s) agrupadas no protocolo ${protocolo.trim()}.`);
    } catch (e) { setError('Erro ao reclamar: ' + (e.response?.data?.error || e.message)); }
  }
  async function reabrir(protocolo) {
    if (!window.confirm(`Devolver os itens do protocolo ${protocolo} para "A reclamar"?`)) return;
    try { const r = await api.post(`/retirada/protocolos/${protocolo}/reabrir`); const byId = new Map(r.data.itens.map(i => [i.id, i])); setItens(prev => prev.map(i => byId.get(i.id) || i)); }
    catch (e) { setError('Erro ao reabrir: ' + (e.response?.data?.error || e.message)); }
  }

  function copiarRaw(texto) {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(texto).catch(() => {});
    else { try { const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch {} }
  }
  function copiar(texto) { copiarRaw(texto); flash('📋 Copiado!'); } // usado pelos botões "Copiar"
  // Aviso discreto flutuante junto do clique (não empurra o layout)
  function tipCopiado(e) { setTip({ x: e.clientX, y: e.clientY }); clearTimeout(tipCopiado._t); tipCopiado._t = setTimeout(() => setTip(null), 900); }
  // Célula clicável: copia o valor ao clicar (SKU / Bling / ML)
  const copyCell = (v, mono) => v
    ? <span onClick={(e) => { copiarRaw(String(v)); tipCopiado(e); }} title="Clique para copiar" style={styles.copyCell}>{mono ? <code>{v}</code> : v}</span>
    : '—';

  async function addOpcao(tipo) {
    const texto = novaOpcao[tipo].trim(); if (!texto) return;
    try { const r = await api.post('/retirada/opcoes', { tipo, texto }); setOpcoes(prev => [...prev, r.data]); setNovaOpcao(o => ({ ...o, [tipo]: '' })); }
    catch (e) { setError('Erro ao adicionar opção: ' + (e.response?.data?.error || e.message)); }
  }
  async function editOpcao(o) {
    const texto = window.prompt('Editar opção:', o.texto); if (texto == null || !texto.trim()) return;
    try { const r = await api.put(`/retirada/opcoes/${o.id}`, { texto: texto.trim() }); setOpcoes(prev => prev.map(x => x.id === o.id ? r.data : x)); }
    catch (e) { setError('Erro ao editar: ' + (e.response?.data?.error || e.message)); }
  }
  async function delOpcao(o) {
    if (!window.confirm(`Remover a opção "${o.texto}"?`)) return;
    try { await api.delete(`/retirada/opcoes/${o.id}`); setOpcoes(prev => prev.filter(x => x.id !== o.id)); }
    catch (e) { setError('Erro ao remover: ' + (e.response?.data?.error || e.message)); }
  }

  const selUnid = pendentes.filter(i => sel.has(i.id)).reduce((a, i) => a + i.qtd, 0);

  return (
    <div>
      <div className="page-header">
        <h1>📦 Solicitar Retirada</h1>
        <p>Registre as devoluções do Full que precisam de ação, agrupe por protocolo e acompanhe até resolver.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      {/* Adicionar item */}
      <div className="card">
        {editId && <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-warning-fg)', marginBottom: '8px' }}>✏️ Editando item — altere e salve, ou cancele.</div>}
        <form onSubmit={submitItem} style={styles.formRow}>
          <div style={{ width: '64px' }}>
            <label style={styles.lbl}>Qtd</label>
            <input type="number" min="1" value={form.qtd} onChange={e => setForm(f => ({ ...f, qtd: e.target.value }))} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={styles.lbl}>SKU</label>
            <input list="retirada-skus" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="Digite p/ buscar..." style={{ textTransform: 'uppercase' }} />
            <datalist id="retirada-skus">{skus.map(s => <option key={s.id} value={s.sku}>{s.descricao_curta || ''}</option>)}</datalist>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={styles.lbl}>Nº Bling</label>
            <input value={form.bling} onChange={e => setForm(f => ({ ...f, bling: e.target.value }))} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={styles.lbl}>Nº Venda ML</label>
            <input value={form.ml} onChange={e => setForm(f => ({ ...f, ml: e.target.value }))} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={styles.lbl}>Motivo</label>
            <select value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}>
              <option value="">—</option>
              {motivos.map(o => <option key={o.id} value={o.texto}>{o.texto}</option>)}
              <option value={CUSTOM}>Personalizado…</option>
            </select>
            {form.motivo === CUSTOM && (
              <input value={form.motivoCustom} onChange={e => setForm(f => ({ ...f, motivoCustom: e.target.value }))} placeholder="Digite o motivo" style={{ marginTop: '4px' }} />
            )}
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={styles.lbl}>Justificativa</label>
            <select value={form.justificativa} onChange={e => setForm(f => ({ ...f, justificativa: e.target.value }))}>
              <option value="">—</option>
              {justificativas.map(o => <option key={o.id} value={o.texto}>{o.texto}</option>)}
              <option value={CUSTOM}>Personalizado…</option>
            </select>
            {form.justificativa === CUSTOM && (
              <input value={form.justCustom} onChange={e => setForm(f => ({ ...f, justCustom: e.target.value }))} placeholder="Digite a justificativa" style={{ marginTop: '4px' }} />
            )}
          </div>
          <div style={{ alignSelf: 'flex-end', display: 'flex', gap: '6px' }}>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? '...' : (editId ? 'Salvar' : '+ Adicionar')}</button>
            {editId && <button type="button" className="btn-outline" onClick={cancelEdit}>Cancelar</button>}
          </div>
        </form>
        <button className="btn-outline" style={{ marginTop: '10px', padding: '4px 10px', fontSize: '12.5px' }} onClick={() => setGerenciar(v => !v)}>
          ⚙ Motivos e justificativas {gerenciar ? '▲' : '▼'}
        </button>
        {gerenciar && (
          <div style={styles.gerenciar}>
            {['motivo', 'justificativa'].map(tipo => (
              <div key={tipo} style={{ flex: '1 1 260px' }}>
                <div style={styles.lbl}>{tipo === 'motivo' ? 'Motivos' : 'Justificativas'}</div>
                {opcoes.filter(o => o.tipo === tipo).map(o => (
                  <div key={o.id} style={styles.opRow}>
                    <span style={{ flex: 1 }}>{o.texto}</span>
                    <button className="btn-outline" style={styles.miniBtn} onClick={() => editOpcao(o)}>editar</button>
                    <button className="btn-outline" style={{ ...styles.miniBtn, color: 'var(--color-error-fg)' }} onClick={() => delOpcao(o)}>🗑</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  <input value={novaOpcao[tipo]} onChange={e => setNovaOpcao(o => ({ ...o, [tipo]: e.target.value }))} placeholder={`Nova ${tipo === 'motivo' ? 'motivo' : 'justificativa'}`} />
                  <button className="btn-secondary" style={{ padding: '5px 10px' }} onClick={() => addOpcao(tipo)}>+</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* A reclamar */}
      <div className="card">
        <div style={styles.secHead}>
          <h2 style={styles.h2}>A reclamar ({pendentes.length})</h2>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar SKU, Bling ou ML..." style={{ width: '220px' }} />
            <button className="btn-outline" style={{ padding: '6px 12px' }} disabled={!sel.size}
              onClick={() => copiar(formatBloco(pendentes.filter(i => sel.has(i.id))))}>📋 Copiar selecionadas</button>
            <button className="btn-primary" style={{ padding: '6px 12px' }} disabled={!sel.size} onClick={reclamar}>
              Reclamar selecionadas{sel.size ? ` (${sel.size})` : ''}
            </button>
          </div>
        </div>
        {Object.keys(motivoCount).length > 1 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
            <span style={styles.lbl}>Motivo</span>
            {Object.keys(motivoCount).sort((a, b) => motivoCount[b] - motivoCount[a]).map(t => (
              <button key={t} onClick={() => toggleMotivo(t)}
                style={{ ...styles.chip, ...(motivoFiltro.has(t) ? styles.chipOn : {}) }}>
                {motivoFiltro.has(t) ? '✓ ' : ''}{t} ({motivoCount[t]})
              </button>
            ))}
            {motivoFiltro.size > 0 && <button onClick={() => setMotivoFiltro(new Set())} style={styles.chip}>limpar</button>}
          </div>
        )}
        {Object.keys(justCount).length > 1 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
            <span style={styles.lbl}>Justificativa</span>
            {Object.keys(justCount).sort((a, b) => justCount[b] - justCount[a]).map(t => (
              <button key={t} onClick={() => toggleJust(t)}
                style={{ ...styles.chip, ...(justFiltro.has(t) ? styles.chipOn : {}) }}>
                {justFiltro.has(t) ? '✓ ' : ''}{t} ({justCount[t]})
              </button>
            ))}
            {justFiltro.size > 0 && <button onClick={() => setJustFiltro(new Set())} style={styles.chip}>limpar</button>}
          </div>
        )}
        {loading ? <p>Carregando...</p> : pendentes.length === 0 ? (
          <div className="empty-state"><p>{(busca.trim() || motivoFiltro.size || justFiltro.size) ? 'Nenhuma pendente para a busca/filtro (veja os blocos abaixo).' : 'Nenhuma venda pendente. Adicione acima.'}</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '36px' }}><input type="checkbox" checked={sel.size === pendentes.length && pendentes.length > 0}
                    onChange={e => setSel(e.target.checked ? new Set(pendentes.map(i => i.id)) : new Set())} /></th>
                  <th style={{ width: '50px' }}>Qtd</th><th>SKU</th><th>Nº Bling</th><th>Nº ML</th><th>Motivo</th><th>Justificativa</th><th></th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map(i => (
                  <tr key={i.id} style={sel.has(i.id) ? { background: 'var(--color-info-bg)' } : undefined}>
                    <td><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleSel(i.id)} /></td>
                    <td style={{ fontWeight: 700 }}>{i.qtd}</td>
                    <td>{copyCell(i.sku, true)}</td>
                    <td>{copyCell(i.bling)}</td>
                    <td>{copyCell(i.ml)}</td>
                    <td style={{ fontSize: '12.5px' }}>{i.motivo || '—'}</td>
                    <td style={{ fontSize: '12.5px' }}>{i.justificativa || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-outline" style={styles.miniBtn} onClick={() => startEdit(i)}>editar</button>
                      <button className="btn-outline" style={{ ...styles.miniBtn, color: 'var(--color-error-fg)', marginLeft: '4px' }} onClick={() => delItem(i.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sel.size > 0 && <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '8px' }}>{sel.size} selecionada(s) · {selUnid} unidade(s)</div>}
      </div>

      {/* Blocos por protocolo */}
      {blocos.map(b => {
        const nResolv = b.itens.filter(i => i.status === 'resolvido').length;
        const nNao = b.itens.filter(i => i.status === 'nao_resolvido').length;
        const selBloco = b.itens.filter(i => sel.has(i.id)).map(i => i.id);
        const cor = nResolv === b.itens.length ? STATUS_BLOCO.resolvido.fg : (nNao ? STATUS_BLOCO.nao_resolvido.fg : STATUS_BLOCO.em_acompanhamento.fg);
        return (
          <div className="card" key={b.protocolo} style={{ borderLeft: `5px solid ${cor}` }}>
            <div style={styles.secHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={styles.h2}>Protocolo {b.protocolo}</h2>
                <a href={casoLink(b.protocolo)} target="_blank" rel="noreferrer" style={{ fontSize: '12.5px', color: 'var(--color-info-fg)' }}>abrir caso ↗</a>
                <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{nResolv}/{b.itens.length} resolvidos{nNao ? ` · ${nNao} não resolvido(s)` : ''}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button className="btn-outline" style={{ padding: '6px 10px' }} onClick={() => copiar(formatBloco(b.itens, `SOLICITAR RETIRADA - protocolo ${b.protocolo}`))}>📋 Copiar</button>
                <button className="btn-outline" style={{ padding: '6px 10px' }} onClick={() => reabrir(b.protocolo)} title="Devolver para 'A reclamar'">↩ Reabrir</button>
              </div>
            </div>
            {selBloco.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{selBloco.length} selecionado(s):</span>
                <button className="btn-secondary" style={{ padding: '5px 10px' }} onClick={() => marcarStatus(selBloco, 'resolvido')}>✓ Resolvido</button>
                <button className="btn-outline" style={{ padding: '5px 10px' }} onClick={() => marcarStatus(selBloco, 'nao_resolvido')}>✗ Não resolvido</button>
                <button className="btn-outline" style={{ padding: '5px 10px' }} onClick={() => marcarStatus(selBloco, 'em_acompanhamento')}>↺ Em acompanhamento</button>
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>
                  <th style={{ width: '36px' }}><input type="checkbox" checked={selBloco.length === b.itens.length && b.itens.length > 0}
                    onChange={e => setSel(prev => { const n = new Set(prev); b.itens.forEach(i => e.target.checked ? n.add(i.id) : n.delete(i.id)); return n; })} /></th>
                  <th style={{ width: '50px' }}>Qtd</th><th>SKU</th><th>Nº Bling</th><th>Nº ML</th><th>Motivo</th><th>Justificativa</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {b.itens.map(i => {
                    const im = STATUS_BLOCO[i.status] || STATUS_BLOCO.em_acompanhamento;
                    return (
                      <tr key={i.id} style={sel.has(i.id) ? { background: 'var(--color-info-bg)' } : undefined}>
                        <td><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleSel(i.id)} /></td>
                        <td style={{ fontWeight: 700 }}>{i.qtd}</td>
                        <td>{copyCell(i.sku, true)}</td>
                        <td>{copyCell(i.bling)}</td><td>{copyCell(i.ml)}</td>
                        <td style={{ fontSize: '12.5px' }}>{i.motivo || '—'}</td>
                        <td style={{ fontSize: '12.5px' }}>{i.justificativa || '—'}</td>
                        <td><span style={{ ...styles.badge, background: im.bg, color: im.fg }}>{im.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {tip && (
        <div style={{ position: 'fixed', left: tip.x + 10, top: tip.y - 26, zIndex: 3000, pointerEvents: 'none',
          background: 'var(--color-foreground)', color: 'var(--color-card)', padding: '2px 8px', borderRadius: '6px',
          fontSize: '11px', fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>Copiado!</div>
      )}
    </div>
  );
}

const styles = {
  formRow: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' },
  lbl: { display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', marginBottom: '3px' },
  gerenciar: { display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' },
  opRow: { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '12.5px' },
  miniBtn: { padding: '2px 8px', fontSize: '11px' },
  secHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' },
  h2: { margin: 0, fontSize: '16px' },
  badge: { fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' },
  chip: { padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'var(--btn-primary, #2b6cb0)', color: '#fff', borderColor: 'var(--btn-primary, #2b6cb0)' },
  copyCell: { cursor: 'pointer', borderRadius: '4px', padding: '1px 3px', transition: 'background 0.1s' },
};
