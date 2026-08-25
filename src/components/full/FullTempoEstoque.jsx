import React, { useState, useEffect, useMemo } from 'react';
import api from '../../utils/api.js';

// Tópico "Tempo de estoque": listas salvas de produtos que pagam tarifa de
// armazenagem (unidades com tempo de estoque). Cada item é encaminhado para
// duas trilhas de revisão — Anúncio e Preço — com status e comentário datado.
// A lista nova é comparada com a anterior (girou vs. continua parado).

function fmtDate(s) { try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; } }
function fmtDay(s) { try { return new Date(s).toLocaleDateString('pt-BR'); } catch { return s; } }
const int = (n) => Math.round(Number(n) || 0).toLocaleString('pt-BR');
const dec = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Trilhas de revisão e seus status possíveis
const AREAS = [
  {
    key: 'anuncio', label: 'Anúncio',
    options: [
      { v: 'revisar', label: 'Precisa mexer', color: '#c05621', bg: '#fffaf0' },
      { v: 'ok', label: 'Revisado / OK', color: '#276749', bg: '#f0fff4' },
    ],
  },
  {
    key: 'preco', label: 'Preço',
    options: [
      { v: 'desconto', label: 'Dar desconto', color: '#c05621', bg: '#fffaf0' },
      { v: 'ok', label: 'Preço OK', color: '#276749', bg: '#f0fff4' },
    ],
  },
];
const areaOpt = (areaKey, v) => AREAS.find(a => a.key === areaKey)?.options.find(o => o.v === v);

// Evolução (comparação com a lista anterior)
const EVOL = {
  critico: { label: '🔴 Crítico', color: '#c53030', rank: 0, hint: 'Continua na lista e sem venda (parado)' },
  novo: { label: '🆕 Novo', color: '#2b6cb0', rank: 1, hint: 'Não estava na lista anterior' },
  girando: { label: '🟡 Girando', color: '#b7791f', rank: 2, hint: 'Continua na lista, mas teve venda' },
};

export default function FullTempoEstoque({ user }) {
  const isAdmin = user?.role === 'admin';
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selId, setSelId] = useState(null);
  const [sel, setSel] = useState(null);        // lista completa selecionada { id, name, items, created_at }
  const [prev, setPrev] = useState(null);      // lista imediatamente anterior (completa)
  const [comments, setComments] = useState([]);// todos os comentários (flat)
  const [loadingSel, setLoadingSel] = useState(false);
  const [evolFiltro, setEvolFiltro] = useState('todos');
  const [expandRef, setExpandRef] = useState(null); // ref com histórico aberto
  const [showResolvidos, setShowResolvidos] = useState(false);
  const [copiado, setCopiado] = useState(null); // ref cujo título acabou de ser copiado
  const [sort, setSort] = useState({ key: null, dir: 'desc' }); // null = ordem padrão (evolução)

  const clickSort = (key) => setSort(s => s.key === key ? (s.dir === 'desc' ? { key, dir: 'asc' } : { key: null, dir: 'desc' }) : { key, dir: 'desc' });
  const sortArrow = (key) => sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';

  const copiarTitulo = (it) => {
    const t = it.titulo || '';
    if (!t) return;
    const ok = () => { setCopiado(it.ref); setTimeout(() => setCopiado(c => (c === it.ref ? null : c)), 1200); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(ok).catch(() => {});
    else { try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); ok(); } catch {} }
  };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError('');
    try {
      const [l, c] = await Promise.all([
        api.get('/full/tempo-estoque'),
        api.get('/full/tempo-estoque/comentarios'),
      ]);
      setLists(l.data || []);
      setComments(c.data || []);
    } catch (err) {
      setError('Erro ao carregar: ' + (err.response?.data?.error || err.message));
    } finally { setLoading(false); }
  }

  async function abrir(id) {
    setSelId(id); setLoadingSel(true); setError(''); setEvolFiltro('todos'); setExpandRef(null); setShowResolvidos(false);
    try {
      const res = await api.get(`/full/tempo-estoque/${id}`);
      setSel(res.data);
      // lista imediatamente anterior (o GET / vem em ordem decrescente por data)
      const idx = lists.findIndex(x => x.id === id);
      const prevMeta = idx >= 0 ? lists[idx + 1] : null;
      if (prevMeta) {
        const pr = await api.get(`/full/tempo-estoque/${prevMeta.id}`);
        setPrev(pr.data);
      } else { setPrev(null); }
    } catch (err) {
      setError('Erro ao abrir a lista: ' + (err.response?.data?.error || err.message));
      setSel(null); setPrev(null);
    } finally { setLoadingSel(false); }
  }

  async function excluir(l) {
    if (!window.confirm(`Excluir a lista "${l.name}"?`)) return;
    try {
      await api.delete(`/full/tempo-estoque/${l.id}`);
      setLists(ls => ls.filter(x => x.id !== l.id));
      if (selId === l.id) { setSel(null); setSelId(null); setPrev(null); }
    } catch (err) {
      setError('Erro ao excluir: ' + (err.response?.data?.error || err.message));
    }
  }

  // Índice de comentários por ref+area (ordenados por data asc)
  const byRef = useMemo(() => {
    const m = {};
    for (const c of comments) {
      const k = c.ref || '';
      if (!m[k]) m[k] = { anuncio: [], preco: [] };
      if (m[k][c.area]) m[k][c.area].push(c);
    }
    return m;
  }, [comments]);

  const statusAtual = (ref, area) => {
    const arr = byRef[ref]?.[area] || [];
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].status) return arr[i]; }
    return null;
  };
  const ultimoComentario = (ref, area) => {
    const arr = byRef[ref]?.[area] || [];
    for (let i = arr.length - 1; i >= 0; i--) { if ((arr[i].texto || '').trim()) return arr[i]; }
    return null;
  };

  // Evolução por item comparando com a lista anterior
  const prevRefs = useMemo(() => new Set((prev?.items || []).map(it => it.ref)), [prev]);
  function evolDe(it) {
    if (!prev) return null;
    if (!prevRefs.has(it.ref)) return 'novo';
    return (Number(it.media_venda) || 0) > 0 ? 'girando' : 'critico';
  }

  const itensView = useMemo(() => {
    const arr = (sel?.items || []).map(it => ({ ...it, evol: evolDe(it) }));
    if (sort.key) {
      const sv = (it) => {
        switch (sort.key) {
          case 'sku': return it.sku || '';
          case 'estoque': return Number(it.estoque_full) || 0;
          case 'vel': return Number(it.media_venda) || 0;
          case 'un_tempo': return Number(it.un_tempo) || 0;
          case 'un_vend': return Number(it.un_vendidas) || 0;
          case 'evol': return it.evol ? EVOL[it.evol].rank : 9;
          default: return 0;
        }
      };
      arr.sort((a, b) => {
        const va = sv(a), vb = sv(b);
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    } else {
      // Padrão: por evolução (críticos → novos → girando), depois un. tempo desc
      arr.sort((a, b) => {
        const ra = a.evol ? EVOL[a.evol].rank : 9;
        const rb = b.evol ? EVOL[b.evol].rank : 9;
        if (ra !== rb) return ra - rb;
        return (Number(b.un_tempo) || 0) - (Number(a.un_tempo) || 0);
      });
    }
    if (evolFiltro === 'todos') return arr;
    return arr.filter(it => it.evol === evolFiltro);
  }, [sel, prevRefs, evolFiltro, sort]);

  // Rótulo das janelas de velocidade e período do relatório (do 1º item que tiver)
  const janelasInfo = useMemo(() => {
    const it = (sel?.items || []).find(x => x.janelas?.length) || (sel?.items || [])[0];
    const jan = it?.janelas?.length ? it.janelas : [7, 15, 30];
    const span = it?.span || null;
    return { label: jan.join('/'), span };
  }, [sel]);

  // Produtos que saíram da lista (estavam na anterior e não estão na atual) = resolvidos
  const resolvidos = useMemo(() => {
    if (!prev || !sel) return [];
    const cur = new Set((sel.items || []).map(it => it.ref));
    return (prev.items || []).filter(it => !cur.has(it.ref));
  }, [prev, sel]);

  const contagem = useMemo(() => {
    const c = { critico: 0, novo: 0, girando: 0 };
    for (const it of (sel?.items || [])) { const e = evolDe(it); if (e) c[e]++; }
    return c;
  }, [sel, prevRefs]);

  async function comentar(ref, area, status, texto) {
    try {
      const res = await api.post('/full/tempo-estoque/comentarios', { ref, area, status, texto });
      setComments(cs => [...cs, res.data]);
      return true;
    } catch (err) {
      setError('Erro ao salvar comentário: ' + (err.response?.data?.error || err.message));
      return false;
    }
  }

  async function excluirComentario(id) {
    if (!window.confirm('Remover este comentário?')) return;
    try {
      await api.delete(`/full/tempo-estoque/comentarios/${id}`);
      setComments(cs => cs.filter(c => c.id !== id));
    } catch (err) {
      setError('Erro ao remover comentário: ' + (err.response?.data?.error || err.message));
    }
  }

  async function exportar() {
    if (!sel) return;
    try {
      const XLSX = await import('xlsx');
      const header = ['SKU', 'MLB', 'Código ML', 'Título', 'Estoque Full', `Vel (${janelasInfo.label})`, 'Un. tempo estq', 'Un. vendidas (Full)', 'Evolução', 'Anúncio (status)', 'Anúncio (comentário)', 'Preço (status)', 'Preço (comentário)'];
      const aoa = [header];
      for (const it of itensView) {
        const sA = statusAtual(it.ref, 'anuncio'); const cA = ultimoComentario(it.ref, 'anuncio');
        const sP = statusAtual(it.ref, 'preco'); const cP = ultimoComentario(it.ref, 'preco');
        aoa.push([
          it.sku, it.anuncio ? 'MLB' + it.anuncio : '', it.codigo_ml || '', it.titulo || '',
          Number(it.estoque_full) || 0, it.vels?.length ? it.vels.map(v => dec(v)).join('/') : dec(it.media_venda), Number(it.un_tempo) || 0, Number(it.un_vendidas) || 0,
          it.evol ? EVOL[it.evol].label.replace(/^[^ ]+ /, '') : '',
          sA ? (areaOpt('anuncio', sA.status)?.label || sA.status) : '', cA?.texto || '',
          sP ? (areaOpt('preco', sP.status)?.label || sP.status) : '', cP?.texto || '',
        ]);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tempo de estoque');
      const d = new Date();
      XLSX.writeFile(wb, `tempo_estoque_${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(2)}.xlsx`);
    } catch (err) {
      setError('Erro ao exportar: ' + (err.message || err));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>⏳ Tempo de estoque</h1>
        <p>Produtos que pagam tarifa de armazenagem no Full — encaminhe para revisão de Anúncio e Preço, e compare com a lista anterior.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Listas salvas */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {loading ? 'Carregando...' : `${lists.length} lista${lists.length !== 1 ? 's' : ''} salva${lists.length !== 1 ? 's' : ''}`}
          </span>
          <button className="btn-outline" onClick={load}>Atualizar</button>
        </div>
        {loading ? null : lists.length === 0 ? (
          <div className="empty-state"><p>Nenhuma lista salva. Gere uma na tela "Envio Full" → "⏳ Salvar lista (tempo de estoque)".</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Lista</th><th>Produtos</th><th>Un. tempo</th><th>Criado por</th><th>Quando</th><th style={{ textAlign: 'right' }}>Ações</th></tr>
              </thead>
              <tbody>
                {lists.map(l => (
                  <tr key={l.id} style={selId === l.id ? { background: 'var(--bg-hover, #f7fafc)' } : undefined}>
                    <td style={{ fontWeight: 600 }}>{l.name}</td>
                    <td>{l.total_itens}</td>
                    <td>{int(l.total_un_tempo)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{l.created_by_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '12.5px', color: 'var(--text-muted)' }}>{fmtDate(l.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button className="btn-primary" style={{ padding: '5px 10px' }} onClick={() => abrir(l.id)}>Abrir</button>
                        {isAdmin && <button className="btn-danger" style={{ padding: '5px 10px' }} onClick={() => excluir(l)}>Excluir</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lista aberta */}
      {loadingSel && <div className="card"><p>Abrindo lista...</p></div>}
      {sel && !loadingSel && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px' }}>{sel.name}</h2>
              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                {(sel.items || []).length} produtos · gerada em {fmtDate(sel.created_at)}
                {prev ? ` · comparando com "${prev.name}" (${fmtDay(prev.created_at)})` : ' · sem lista anterior para comparar'}
              </span>
            </div>
            <button className="btn-outline" onClick={exportar}>📄 Exportar (xlsx)</button>
          </div>

          {/* Filtros de evolução */}
          {prev && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <button style={chip(evolFiltro === 'todos')} onClick={() => setEvolFiltro('todos')}>Todos ({(sel.items || []).length})</button>
              <button style={chip(evolFiltro === 'critico')} onClick={() => setEvolFiltro('critico')}>🔴 Críticos ({contagem.critico})</button>
              <button style={chip(evolFiltro === 'novo')} onClick={() => setEvolFiltro('novo')}>🆕 Novos ({contagem.novo})</button>
              <button style={chip(evolFiltro === 'girando')} onClick={() => setEvolFiltro('girando')}>🟡 Girando ({contagem.girando})</button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} title="Ordenar por SKU" onClick={() => clickSort('sku')}>SKU{sortArrow('sku')}</th>
                  <th>MLB</th><th>Código ML</th>
                  <th style={{ textAlign: 'center' }} title="Título do anúncio (passe o mouse; clique para copiar)">Tít.</th>
                  <th style={{ textAlign: 'right', cursor: 'pointer' }} title="Ordenar por estoque no Full" onClick={() => clickSort('estoque')}>Estq Full{sortArrow('estoque')}</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap', cursor: 'pointer' }} title="Velocidade de venda (un/dia) — clique para ordenar" onClick={() => clickSort('vel')}>Vel ({janelasInfo.label}){sortArrow('vel')}</th>
                  <th style={{ textAlign: 'right', cursor: 'pointer' }} title="Ordenar por unidades em tempo de estoque" onClick={() => clickSort('un_tempo')}>Un. tempo{sortArrow('un_tempo')}</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'nowrap', cursor: 'pointer' }} title={`Unidades vendidas pelo Full no período do relatório${janelasInfo.span ? ` (~${Math.round(janelasInfo.span)} dias)` : ''} — clique para ordenar`} onClick={() => clickSort('un_vend')}>Un. vend. (Full){sortArrow('un_vend')}</th>
                  {prev && <th style={{ cursor: 'pointer' }} title="Ordenar por evolução" onClick={() => clickSort('evol')}>Evolução{sortArrow('evol')}</th>}
                  <th style={{ minWidth: '220px' }}>Anúncio</th>
                  <th style={{ minWidth: '220px' }}>Preço</th>
                </tr>
              </thead>
              <tbody>
                {itensView.map(it => (
                  <tr key={it.ref || it.sku}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{it.sku}</td>
                    <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px' }}>{it.anuncio ? 'MLB' + it.anuncio : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px' }}>{it.codigo_ml || '—'}</td>
                    <td style={{ textAlign: 'center', cursor: 'pointer' }} title={(it.titulo || '') + ' — clique para copiar o título'} onClick={() => copiarTitulo(it)}>{copiado === it.ref ? '✅' : 'ℹ️'}</td>
                    <td style={{ textAlign: 'right' }}>{int(it.estoque_full)}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{it.vels?.length ? it.vels.map(dec).join('/') : dec(it.media_venda)}</td>
                    <td style={{ textAlign: 'right', color: '#c05621', fontWeight: 700 }}>{int(it.un_tempo)}</td>
                    <td style={{ textAlign: 'right' }}>{int(it.un_vendidas)}</td>
                    {prev && <td style={{ whiteSpace: 'nowrap', color: it.evol ? EVOL[it.evol].color : 'var(--text-muted)', fontWeight: 600 }} title={it.evol ? EVOL[it.evol].hint : ''}>{it.evol ? EVOL[it.evol].label : '—'}</td>}
                    <td><TrilhaCell ref_={it.ref} area="anuncio" byRef={byRef} onComentar={comentar} onExcluir={excluirComentario} expandRef={expandRef} setExpandRef={setExpandRef} /></td>
                    <td><TrilhaCell ref_={it.ref} area="preco" byRef={byRef} onComentar={comentar} onExcluir={excluirComentario} expandRef={expandRef} setExpandRef={setExpandRef} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Resolvidos (saíram da lista) */}
          {resolvidos.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <button className="btn-outline" style={{ padding: '5px 12px' }} onClick={() => setShowResolvidos(v => !v)}>
                ✅ {resolvidos.length} produto{resolvidos.length !== 1 ? 's' : ''} saíram da lista (resolvidos) {showResolvidos ? '▲' : '▼'}
              </button>
              {showResolvidos && (
                <div style={{ overflowX: 'auto', marginTop: '8px' }}>
                  <table style={{ fontSize: '12.5px' }}>
                    <thead><tr><th>SKU</th><th>MLB</th><th>Título</th><th style={{ textAlign: 'right' }}>Un. tempo (antes)</th></tr></thead>
                    <tbody>
                      {resolvidos.map(it => (
                        <tr key={it.ref || it.sku}>
                          <td style={{ fontWeight: 600 }}>{it.sku}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{it.anuncio ? 'MLB' + it.anuncio : '—'}</td>
                          <td title={it.titulo}>{it.titulo || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{int(it.un_tempo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Célula de uma trilha (Anúncio ou Preço): status atual + último comentário + adicionar/histórico
function TrilhaCell({ ref_, area, byRef, onComentar, onExcluir, expandRef, setExpandRef }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [texto, setTexto] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingQuick, setSavingQuick] = useState(false);

  const arr = byRef[ref_]?.[area] || [];
  let curStatus = null; for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].status) { curStatus = arr[i]; break; } }
  let ultTexto = null; for (let i = arr.length - 1; i >= 0; i--) { if ((arr[i].texto || '').trim()) { ultTexto = arr[i]; break; } }
  const opt = curStatus ? areaOpt(area, curStatus.status) : null;
  const histAberto = expandRef === ref_ + ':' + area;

  async function salvar() {
    if (!status && !texto.trim()) return;
    setSaving(true);
    const ok = await onComentar(ref_, area, status || null, texto.trim());
    setSaving(false);
    if (ok) { setStatus(''); setTexto(''); setOpen(false); }
  }

  // Menu rápido: grava só o status, sem comentário
  async function mudarStatus(v) {
    if (savingQuick) return;
    setSavingQuick(true);
    await onComentar(ref_, area, v, '');
    setSavingQuick(false);
  }

  if (!ref_) return <span style={{ color: 'var(--text-muted)' }}>—</span>;

  return (
    <div style={{ minWidth: '210px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11.5px', fontWeight: 700,
          color: opt ? opt.color : 'var(--text-muted)', background: opt ? opt.bg : 'transparent', border: '1px solid ' + (opt ? opt.color : 'var(--border)') }}>
          {opt ? opt.label : 'A revisar'}
        </span>
        <select value={curStatus?.status || 'pendente'} disabled={savingQuick} onChange={e => mudarStatus(e.target.value)}
          title="Alterar status (grava sem comentário)" style={{ padding: '2px 4px', fontSize: '11px', maxWidth: '130px' }}>
          <option value="pendente">A revisar</option>
          {AREAS.find(a => a.key === area).options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        {curStatus && <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{fmtDay(curStatus.created_at)} · {curStatus.created_by_name}</span>}
      </div>
      {ultTexto && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', fontStyle: 'italic' }} title={`${ultTexto.created_by_name} · ${fmtDate(ultTexto.created_at)}`}>
          “{ultTexto.texto}”
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button className="btn-outline" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setOpen(v => !v)}>{open ? 'fechar' : '+ comentar'}</button>
        {arr.length > 0 && <button className="btn-outline" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setExpandRef(histAberto ? null : ref_ + ':' + area)}>histórico ({arr.length})</button>}
      </div>

      {open && (
        <div style={{ marginTop: '6px', padding: '8px', background: 'var(--bg-hover, #f7fafc)', borderRadius: '6px' }}>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%', padding: '5px', marginBottom: '5px', fontSize: '12px' }}>
            <option value="">(manter status)</option>
            {AREAS.find(a => a.key === area).options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <textarea rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Comentário (opcional)"
            style={{ width: '100%', padding: '5px', fontSize: '12px', resize: 'vertical' }} />
          <button className="btn-primary" style={{ padding: '3px 10px', fontSize: '12px', marginTop: '4px' }} disabled={saving || (!status && !texto.trim())} onClick={salvar}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      )}

      {histAberto && arr.length > 0 && (
        <div style={{ marginTop: '6px', borderTop: '1px dashed var(--border)', paddingTop: '5px', maxHeight: '180px', overflowY: 'auto' }}>
          {[...arr].reverse().map(c => {
            const o = areaOpt(area, c.status);
            return (
              <div key={c.id} style={{ fontSize: '11.5px', marginBottom: '5px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{fmtDate(c.created_at)} · {c.created_by_name}</span>
                {c.status && <span style={{ marginLeft: '5px', fontWeight: 700, color: o ? o.color : 'inherit' }}>[{o ? o.label : (c.status === 'pendente' ? 'A revisar' : c.status)}]</span>}
                {onExcluir && <button onClick={() => onExcluir(c.id)} title="Remover comentário"
                  style={{ marginLeft: '6px', border: 'none', background: 'none', cursor: 'pointer', color: '#c53030', fontSize: '11px', padding: 0 }}>🗑</button>}
                {c.texto && <div style={{ color: 'var(--text-secondary)' }}>{c.texto}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function chip(active) {
  return {
    padding: '5px 12px', borderRadius: '16px', fontSize: '12.5px', cursor: 'pointer',
    border: '1px solid ' + (active ? 'var(--brand, #2b6cb0)' : 'var(--border)'),
    background: active ? 'var(--brand, #2b6cb0)' : 'transparent',
    color: active ? '#fff' : 'var(--text-primary)', fontWeight: active ? 700 : 400,
  };
}
