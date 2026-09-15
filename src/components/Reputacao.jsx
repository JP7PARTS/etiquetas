import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../utils/api.js';

// Reclamações / Reputação: casos de vendas que afetam a reputação e precisam ser
// contestadas no ML. Sobe a planilha "Vendas com problemas", anota análise + argumento,
// registra tentativas (IA/Humano) com protocolo e link, e acompanha o status de cada caso.

const STATUS_META = {
  a_analisar: { label: 'A analisar', bg: '#e2e8f0', fg: '#2d3748' },
  reclamada: { label: 'Reclamada (aguardando)', bg: '#bee3f8', fg: '#2a4365' },
  aguardar: { label: 'Aguardar até data', bg: '#feebc8', fg: '#7b341e' },
  resolvida: { label: 'Resolvida ✓', bg: '#c6f6d5', fg: '#22543d' },
  recusada: { label: 'Recusada', bg: '#fed7d7', fg: '#822727' },
};
const STATUS_ORDER = ['a_analisar', 'reclamada', 'aguardar', 'resolvida', 'recusada'];
// Rótulo curto para o chip de tipo de problema
const tipoLabel = (t) => {
  const s = (t || '').toLowerCase();
  if (s.includes('entregue')) return '📦 Produto entregue';
  if (s.includes('gerenciar') || s.includes('preparar')) return '🛠️ Preparar/gerenciar';
  if (s.includes('outros')) return '❓ Outros motivos';
  return t;
};
const vendaLink = (n) => `https://www.mercadolivre.com.br/vendas/${n}/detalhe`;
const casoLink = (p) => `https://www.mercadolivre.com.br/cases/detail/${p}`;
const fmtDT = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
const fmtDay = (s) => { if (!s) return ''; try { return new Date(s + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return s; } };
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Reputacao() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [parsing, setParsing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFiltro, setStatusFiltro] = useState(new Set()); // vazio = todos
  const [tipoFiltro, setTipoFiltro] = useState(new Set());     // filtro por tipo de problema
  const [showSairam, setShowSairam] = useState(false);
  const [copiado, setCopiado] = useState(null);
  const [expanded, setExpanded] = useState(new Set()); // # das vendas expandidas (padrão: todas minimizadas)
  const inputRef = useRef(null);
  const toggleExpand = (numero) => setExpanded(prev => { const n = new Set(prev); n.has(numero) ? n.delete(numero) : n.add(numero); return n; });

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true); setError('');
    try { const r = await api.get('/reputacao'); setCases(r.data || []); }
    catch (e) { setError('Erro ao carregar: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  }

  // Atualiza um caso no estado local a partir da linha retornada pelo servidor
  const applyRow = (row) => setCases(cs => cs.map(c => c.numero_venda === row.numero_venda ? row : c));

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setError(''); setMsg('');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const m = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
      const hi = m.findIndex(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() === '# da venda'));
      if (hi < 0) throw new Error('Não encontrei a coluna "# da venda". Confirme se é a planilha "Vendas com problemas" do ML.');
      const H = m[hi].map(c => String(c ?? '').trim());
      const ci = (n) => H.indexOf(n);
      const cNum = ci('# da venda'), cData = ci('Data da venda'), cTit = ci('Título do anúncio'),
        cTipo = ci('Tipo de problema'), cDet = ci('Detalhe do problema'), cExc = ci('Exclusão');
      const items = [];
      for (let i = hi + 1; i < m.length; i++) {
        const r = m[i]; if (!Array.isArray(r)) continue;
        const numero = String(r[cNum] ?? '').trim();
        if (!numero) continue;
        items.push({
          numero_venda: numero,
          data_venda: cData >= 0 ? String(r[cData] ?? '').trim() : '',
          titulo: cTit >= 0 ? String(r[cTit] ?? '').trim() : '',
          tipo_problema: cTipo >= 0 ? String(r[cTipo] ?? '').trim() : '',
          detalhe_problema: cDet >= 0 ? String(r[cDet] ?? '').trim() : '',
          exclusao: cExc >= 0 ? String(r[cExc] ?? '').trim() : '',
        });
      }
      if (items.length === 0) throw new Error('Nenhuma venda encontrada na planilha.');
      const res = await api.post('/reputacao/importar', { items });
      const d = res.data;
      setMsg(`✅ Planilha importada: ${d.novos} nova(s), ${d.atualizados} atualizada(s)${d.sairam ? `, ${d.sairam} saíram da lista` : ''}.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Erro ao ler a planilha');
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
      setTimeout(() => setMsg(''), 6000);
    }
  }

  async function salvarCampo(numero, campo, valor) {
    try { const r = await api.put(`/reputacao/${numero}`, { [campo]: valor }); applyRow(r.data); }
    catch (e) { setError('Erro ao salvar: ' + (e.response?.data?.error || e.message)); }
  }
  async function addTentativa(numero, canal, protocolo, nota) {
    try { const r = await api.post(`/reputacao/${numero}/tentativas`, { canal, protocolo, nota }); applyRow(r.data); return true; }
    catch (e) { setError('Erro ao salvar tentativa: ' + (e.response?.data?.error || e.message)); return false; }
  }
  async function delTentativa(numero, tid) {
    try { const r = await api.delete(`/reputacao/${numero}/tentativas/${tid}`); applyRow(r.data); }
    catch (e) { setError('Erro ao remover: ' + (e.response?.data?.error || e.message)); }
  }
  async function excluirCaso(numero) {
    if (!window.confirm('Remover este caso da lista?')) return;
    try { await api.delete(`/reputacao/${numero}`); setCases(cs => cs.filter(c => c.numero_venda !== numero)); }
    catch (e) { setError('Erro ao remover: ' + (e.response?.data?.error || e.message)); }
  }

  function copiar(txt, key) {
    if (!txt) return;
    const ok = () => { setCopiado(key); setTimeout(() => setCopiado(k => k === key ? null : k), 1200); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(ok).catch(() => {});
    else { try { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); ok(); } catch {} }
  }

  const ativos = useMemo(() => cases.filter(c => c.ativo), [cases]);
  const saíram = useMemo(() => cases.filter(c => !c.ativo), [cases]);
  const statusCount = useMemo(() => {
    const c = {}; for (const x of ativos) c[x.status] = (c[x.status] || 0) + 1; return c;
  }, [ativos]);
  const tipoCount = useMemo(() => {
    const c = {}; for (const x of ativos) { const t = (x.tipo_problema || '').trim(); if (t) c[t] = (c[t] || 0) + 1; } return c;
  }, [ativos]);

  const q = search.trim().toLowerCase();
  const view = useMemo(() => ativos.filter(c =>
    (!statusFiltro.size || statusFiltro.has(c.status)) &&
    (!tipoFiltro.size || tipoFiltro.has((c.tipo_problema || '').trim())) &&
    (!q || c.numero_venda.includes(q) || (c.titulo || '').toLowerCase().includes(q))
  ), [ativos, statusFiltro, tipoFiltro, q]);

  const toggleStatus = (k) => setStatusFiltro(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleTipo = (k) => setTipoFiltro(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div>
      <div className="page-header">
        <h1>⚖️ Reclamações</h1>
        <p>Vendas que afetam sua reputação — analise, argumente e acompanhe as tentativas de remover o impacto no Mercado Livre.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="card">
        <div style={styles.uploadRow}>
          <button className="btn-primary" onClick={() => inputRef.current?.click()} disabled={parsing}>
            {parsing ? 'Lendo planilha...' : '📥 Subir planilha "Vendas com problemas" (.xlsx)'}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {loading ? 'Carregando...' : `${ativos.length} caso(s) ativo(s)`}
          </span>
        </div>

        {ativos.length > 0 && (
          <>
            <div style={styles.toolbar}>
              <div style={styles.searchWrapper}>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar # da venda ou título..." style={{ width: '100%' }} />
              </div>
            </div>
            <div style={styles.chipRow}>
              <span style={styles.chipGroupLbl}>Status</span>
              {STATUS_ORDER.filter(k => statusCount[k]).map(k => (
                <button key={k} onClick={() => toggleStatus(k)}
                  style={{ ...styles.chip, ...(statusFiltro.has(k) ? { background: STATUS_META[k].fg, color: '#fff', borderColor: STATUS_META[k].fg } : {}) }}>
                  {statusFiltro.has(k) ? '✓ ' : ''}{STATUS_META[k].label} ({statusCount[k]})
                </button>
              ))}
              {statusFiltro.size > 0 && <button onClick={() => setStatusFiltro(new Set())} style={styles.chip}>limpar</button>}
            </div>
            {Object.keys(tipoCount).length > 0 && (
              <div style={styles.chipRow}>
                <span style={styles.chipGroupLbl}>Problema</span>
                {Object.keys(tipoCount).sort((a, b) => tipoCount[b] - tipoCount[a]).map(t => (
                  <button key={t} onClick={() => toggleTipo(t)}
                    style={{ ...styles.chip, ...(tipoFiltro.has(t) ? styles.chipOn : {}) }}>
                    {tipoFiltro.has(t) ? '✓ ' : ''}{tipoLabel(t)} ({tipoCount[t]})
                  </button>
                ))}
                {tipoFiltro.size > 0 && <button onClick={() => setTipoFiltro(new Set())} style={styles.chip}>limpar</button>}
              </div>
            )}
          </>
        )}

        {loading ? null : ativos.length === 0 ? (
          <div className="empty-state"><p>Nenhum caso ainda. Suba a planilha "Vendas com problemas" exportada do Mercado Livre.</p></div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button className="btn-outline" style={{ padding: '5px 12px' }}
                onClick={() => setExpanded(new Set(view.map(c => c.numero_venda)))}>▼ Expandir todas</button>
              <button className="btn-outline" style={{ padding: '5px 12px' }}
                onClick={() => setExpanded(new Set())}>▶ Minimizar todas</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '2px' }}>
              {view.map(c => (
                <CaseCard key={c.numero_venda} c={c} expanded={expanded.has(c.numero_venda)} onToggle={() => toggleExpand(c.numero_venda)}
                  copiado={copiado} onCopiar={copiar}
                  onCampo={salvarCampo} onAddTent={addTentativa} onDelTent={delTentativa} onExcluir={excluirCaso} />
              ))}
              {view.length === 0 && <div className="empty-state"><p>Nenhum caso no filtro atual.</p></div>}
            </div>
          </>
        )}

        {saíram.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <button className="btn-outline" style={{ padding: '5px 12px' }} onClick={() => setShowSairam(v => !v)}>
              📤 {saíram.length} saíram da última planilha (confira se foram resolvidas) {showSairam ? '▲' : '▼'}
            </button>
            {showSairam && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '8px' }}>
                {saíram.map(c => (
                  <CaseCard key={c.numero_venda} c={c} saiu expanded={expanded.has(c.numero_venda)} onToggle={() => toggleExpand(c.numero_venda)}
                    copiado={copiado} onCopiar={copiar}
                    onCampo={salvarCampo} onAddTent={addTentativa} onDelTent={delTentativa} onExcluir={excluirCaso} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CaseCard({ c, saiu, expanded, onToggle, copiado, onCopiar, onCampo, onAddTent, onDelTent, onExcluir }) {
  const [analise, setAnalise] = useState(c.analise || '');
  const [argumento, setArgumento] = useState(c.argumento || '');
  const [canal, setCanal] = useState('ia');
  const [protocolo, setProtocolo] = useState('');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setAnalise(c.analise || ''); setArgumento(c.argumento || ''); }, [c.numero_venda]);

  const sm = STATUS_META[c.status] || STATUS_META.a_analisar;
  const tentativas = Array.isArray(c.tentativas) ? c.tentativas : [];

  async function enviarTentativa() {
    if (!protocolo.trim() && !nota.trim()) return;
    setSaving(true);
    const ok = await onAddTent(c.numero_venda, canal, protocolo.trim(), nota.trim());
    setSaving(false);
    if (ok) { setProtocolo(''); setNota(''); }
  }

  const iaN = tentativas.filter(t => t.canal !== 'humano').length;
  const humN = tentativas.filter(t => t.canal === 'humano').length;

  return (
    <div style={{ ...styles.caseCard, borderLeft: `5px solid ${sm.fg}`, ...(saiu ? { opacity: 0.7 } : {}) }}>
      {/* Cabeçalho minimizado (clique expande) */}
      <div style={styles.caseHead} onClick={onToggle} title={expanded ? 'Recolher' : 'Expandir'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px', width: '12px' }}>{expanded ? '▼' : '▶'}</span>
          <a href={vendaLink(c.numero_venda)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            style={styles.vendaNum} title="Abrir a venda no Mercado Livre">#{c.numero_venda}</a>
          <span style={{ ...styles.statusBadge, background: sm.bg, color: sm.fg }}>{sm.label}</span>
          <span style={styles.miniCount} title="Tentativas com IA">🤖 {iaN}</span>
          <span style={styles.miniCount} title="Tentativas com humano">👤 {humN}</span>
          {c.status === 'aguardar' && c.aguardar_ate && (
            <span style={{ fontSize: '12px', color: '#7b341e', fontWeight: 600 }}>⏰ {fmtDay(c.aguardar_ate)}</span>
          )}
        </div>
        {expanded && (
          <button onClick={(e) => { e.stopPropagation(); onExcluir(c.numero_venda); }} title="Remover caso"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#c53030', fontSize: '14px' }}>🗑</button>
        )}
      </div>

      {!expanded ? null : (<>
      <div style={{ marginTop: '6px' }} />
      <div style={styles.tituloRow}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.data_venda}</span>
      </div>
      <div style={styles.titulo}>
        <span>{c.titulo || '—'}</span>
        <button onClick={() => onCopiar(c.titulo, c.numero_venda)} title="Copiar o título"
          style={styles.infoBtn}>{copiado === c.numero_venda ? '✅' : 'ℹ️'}</button>
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
        <b>{c.tipo_problema || '—'}</b>{c.detalhe_problema ? ` · ${c.detalhe_problema}` : ''}
        {c.exclusao && <span style={{ color: 'var(--text-muted)' }}> · ML: {c.exclusao}</span>}
      </div>

      {/* Status + aguardar até */}
      <div style={styles.linha}>
        <span style={styles.lbl}>Status</span>
        <select value={c.status} onChange={e => onCampo(c.numero_venda, 'status', e.target.value)} style={styles.sel}>
          {STATUS_ORDER.map(k => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
        </select>
        {c.status === 'aguardar' && (
          <>
            <span style={styles.lbl}>Verificar em</span>
            <input type="date" value={c.aguardar_ate ? c.aguardar_ate.slice(0, 10) : todayISO()}
              onChange={e => onCampo(c.numero_venda, 'aguardar_ate', e.target.value)} style={styles.dt} />
          </>
        )}
      </div>

      {/* Análise e argumento */}
      <div style={styles.grid2}>
        <div>
          <span style={styles.lbl}>Análise (o que aconteceu)</span>
          <textarea rows={4} value={analise} onChange={e => setAnalise(e.target.value)}
            onBlur={() => analise !== (c.analise || '') && onCampo(c.numero_venda, 'analise', analise)}
            placeholder="Descreva o problema da venda..." style={styles.ta} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={styles.lbl}>Argumento (como justificar)</span>
            <button onClick={() => onCopiar(argumento, c.numero_venda + ':arg')} disabled={!argumento.trim()}
              title="Copiar o argumento" style={styles.copyArg}>
              {copiado === c.numero_venda + ':arg' ? '✅ copiado' : '📋 copiar'}
            </button>
          </div>
          <textarea rows={4} value={argumento} onChange={e => setArgumento(e.target.value)}
            onBlur={() => argumento !== (c.argumento || '') && onCampo(c.numero_venda, 'argumento', argumento)}
            placeholder="Como vai argumentar para remover o impacto..." style={styles.ta} />
        </div>
      </div>

      {/* Tentativas */}
      <div style={{ marginTop: '8px' }}>
        <span style={styles.lbl}>Tentativas ({tentativas.length}){tentativas.length ? ` — reclamou ${tentativas.length}x` : ''}</span>
        {tentativas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '4px 0' }}>
            {tentativas.map(t => (
              <div key={t.id} style={styles.tent}>
                <span style={{ ...styles.canalBadge, background: t.canal === 'humano' ? '#e9d8fd' : '#bee3f8', color: t.canal === 'humano' ? '#553c9a' : '#2a4365' }}>
                  {t.canal === 'humano' ? '👤 Humano' : '🤖 IA'}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{fmtDT(t.data)}</span>
                {t.protocolo && <a href={casoLink(t.protocolo)} target="_blank" rel="noreferrer" style={styles.proto}>caso {t.protocolo} ↗</a>}
                {t.nota && <span style={{ fontSize: '12.5px' }}>— {t.nota}</span>}
                <button onClick={() => onDelTent(c.numero_venda, t.id)} title="Remover tentativa"
                  style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#c53030', fontSize: '12px' }}>🗑</button>
              </div>
            ))}
          </div>
        )}
        <div style={styles.addTent}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
            <button onClick={() => setCanal('ia')} style={{ ...styles.canalTgl, ...(canal === 'ia' ? styles.canalTglOn : {}) }}>🤖 IA</button>
            <button onClick={() => setCanal('humano')} style={{ ...styles.canalTgl, ...(canal === 'humano' ? styles.canalTglOn : {}) }}>👤 Humano</button>
          </div>
          <input type="text" value={protocolo} onChange={e => setProtocolo(e.target.value)} placeholder="Protocolo (nº do caso)" style={{ ...styles.inp, width: '150px' }} />
          <input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (o que respondeu / resultado)" style={{ ...styles.inp, flex: 1, minWidth: '160px' }} />
          <button className="btn-primary" style={{ padding: '5px 12px' }} disabled={saving || (!protocolo.trim() && !nota.trim())} onClick={enviarTentativa}>
            {saving ? '...' : '+ Registrar'}
          </button>
        </div>
      </div>
      </>)}
    </div>
  );
}

const styles = {
  uploadRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' },
  toolbar: { display: 'flex', gap: '12px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' },
  searchWrapper: { flex: 1, minWidth: '220px' },
  chipRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' },
  chipGroupLbl: { fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '2px' },
  chip: { padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'var(--btn-primary, #2b6cb0)', color: '#fff', borderColor: 'var(--btn-primary, #2b6cb0)' },
  copyArg: { padding: '2px 8px', fontSize: '11px', fontWeight: 700, border: '1px solid var(--border)', borderRadius: '6px', background: '#fff', color: '#2b6cb0', cursor: 'pointer' },
  caseCard: { border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.07)' },
  caseHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' },
  vendaNum: { fontFamily: 'monospace', fontWeight: 700, color: '#2b6cb0', textDecoration: 'none', fontSize: '13.5px' },
  miniCount: { fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-hover, #f1f5f9)', padding: '1px 8px', borderRadius: '10px', whiteSpace: 'nowrap' },
  tituloRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' },
  statusBadge: { fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' },
  titulo: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '14px', marginBottom: '3px' },
  infoBtn: { border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px' },
  linha: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' },
  lbl: { fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' },
  sel: { padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px' },
  dt: { padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' },
  ta: { width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px', resize: 'vertical', marginTop: '2px' },
  tent: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '4px 8px', background: 'var(--bg-hover, #f7fafc)', borderRadius: '6px' },
  canalBadge: { fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', whiteSpace: 'nowrap' },
  proto: { fontSize: '12px', color: '#2b6cb0', textDecoration: 'none', fontFamily: 'monospace' },
  addTent: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' },
  canalTgl: { padding: '5px 10px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' },
  canalTglOn: { background: 'var(--btn-primary, #2b6cb0)', color: '#fff' },
  inp: { padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px' },
};
