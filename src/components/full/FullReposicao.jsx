import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../utils/api.js';
import { computeReposicao } from './calc.js';
import moldeUrl from './molde_full.xlsx?url';

const n1 = (n) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = (n) => Math.round(n || 0).toLocaleString('pt-BR');
const brl = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtDia = (d) => { try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch { return ''; } };

const ALERT_STYLE = {
  'estoura cross': { bg: '#fed7d7', fg: '#822727' },
  'sem estoque full': { bg: '#feebc8', fg: '#7b341e' },
  'sem venda': { bg: '#e2e8f0', fg: '#4a5568' },
  'caindo forte': { bg: '#fefcbf', fg: '#744210' },
  'subindo forte': { bg: '#c6f6d5', fg: '#22543d' },
  'SKU já no Full': { bg: '#e9d8fd', fg: '#553c9a' },
  'a caminho': { bg: '#bee3f8', fg: '#2a4365' },
  'aguardando cross': { bg: '#e2e8f0', fg: '#4a5568' },
  'cross voltou': { bg: '#9ae6b4', fg: '#22543d' },
};

const DECISOES = ['Manter', 'Promover', 'Avaliar saída', 'Ignorar'];
// Chave persistente por anúncio: Código ML quando existe, senão o MLB do anúncio.
const refDe = (r) => r.codigoMl || (r.anuncio ? 'MLB' + r.anuncio : '');
const DEC_STYLE = {
  'Manter': { bg: '#bee3f8', fg: '#2a4365' },
  'Promover': { bg: '#c6f6d5', fg: '#22543d' },
  'Avaliar saída': { bg: '#feebc8', fg: '#7b341e' },
  'Ignorar': { bg: '#e2e8f0', fg: '#4a5568' },
  'Não enviar': { bg: '#fed7d7', fg: '#822727' },
};

// resumo já parseado. vendas = {7,15,30} (7/15 podem ser null), cross, desempenho opcionais.
export default function FullReposicao({ resumo, vendas, cross, desempenho, envioEdit, onEditConsumed }) {
  const [regra, setRegra] = useState('MAX');
  const [dias, setDias] = useState(30);
  const [janelasTxt, setJanelasTxt] = useState('7, 15, 30');
  const [reconciliar, setReconciliar] = useState(true);
  const [limiar2, setLimiar2] = useState(15);
  const [verTodos, setVerTodos] = useState(false); // por padrão, só os melhores (Top N)
  const [showRec, setShowRec] = useState(false);
  const [rank, setRank] = useState({ metodo: 'topN', topN: 50, corteUn: 0, corteRs: 0 });
  const [rankPor, setRankPor] = useState('anuncio'); // 'anuncio' (padrão) | 'sku'
  const [decFiltro, setDecFiltro] = useState('Todos');
  const [overrides, setOverrides] = useState({}); // codigoMl -> qty final (rascunho no navegador, atrelado ao relatório)
  const [historico, setHistorico] = useState({}); // codigoMl -> total enviado
  const [notes, setNotes] = useState({});         // codigoMl -> nota
  const [sort, setSort] = useState({ key: 'rqtd', dir: 'asc' });
  const [excluidos, setExcluidos] = useState(new Set());
  const [crossWait, setCrossWait] = useState(new Set()); // codigoMl marcados "cross esgotado"
  const [gradeSet, setGradeSet] = useState(new Set());   // refs marcados "Full grade" (resto é Geral)
  const [tipoSel, setTipoSel] = useState(new Set(['geral', 'grade'])); // filtro por tipo (multi)
  const [busca, setBusca] = useState('');
  const [showOrfas, setShowOrfas] = useState(false);
  const [saving, setSaving] = useState(false);
  const [envioId, setEnvioId] = useState(null);   // id do envio salvo em edição (null = novo)
  const [envioNome, setEnvioNome] = useState('');  // nome do envio em edição
  const [msg, setMsg] = useState('');
  const [copiado, setCopiado] = useState(null); // key da linha cujo título acabou de ser copiado
  const copiarTitulo = (r) => {
    const t = r.tituloTop || r.produto || '';
    if (!t) return;
    const ok = () => { setCopiado(r.key); setTimeout(() => setCopiado(c => (c === r.key ? null : c)), 1200); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(ok).catch(() => {});
    else { try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); ok(); } catch {} }
  };

  useEffect(() => {
    api.get('/full/shipments/historico').then(r => {
      const map = {}; (r.data || []).forEach(x => { map[x.codigo_ml] = Number(x.total) || 0; });
      setHistorico(map);
    }).catch(() => {});
    api.get('/full/notes').then(r => {
      const map = {}; (r.data || []).forEach(x => { map[x.codigo_ml] = x.note || ''; });
      setNotes(map);
    }).catch(() => {});
    carregarExcluidos();
    carregarCrossWait();
    carregarGrade();
  }, []);

  function carregarGrade() {
    api.get('/full/grade').then(r => setGradeSet(new Set((r.data || []).map(x => x.codigo_ml)))).catch(() => {});
  }
  const tipoDe = (r) => (gradeSet.has(refDe(r)) ? 'grade' : 'geral');
  async function marcarGrade(r) {
    const ref = refDe(r); if (!ref) return;
    setGradeSet(prev => new Set(prev).add(ref));
    try { await api.post('/full/grade', { codigo_ml: ref, sku: r.sku }); } catch { carregarGrade(); }
  }
  async function desmarcarGrade(r) {
    const ref = refDe(r); if (!ref) return;
    setGradeSet(prev => { const n = new Set(prev); n.delete(ref); return n; });
    try { await api.delete(`/full/grade/${encodeURIComponent(ref)}`); } catch { carregarGrade(); }
  }
  const toggleTipo = (r) => (tipoDe(r) === 'grade' ? desmarcarGrade(r) : marcarGrade(r));

  function carregarExcluidos() {
    api.get('/full/excluidos').then(r => setExcluidos(new Set((r.data || []).map(x => x.sku)))).catch(() => {});
  }
  function carregarCrossWait() {
    api.get('/full/cross-wait').then(r => setCrossWait(new Set((r.data || []).map(x => x.codigo_ml)))).catch(() => {});
  }
  async function marcarCross(r) {
    const ref = refDe(r); if (!ref) return;
    setCrossWait(prev => new Set(prev).add(ref)); // otimista
    try { await api.post('/full/cross-wait', { codigo_ml: ref, sku: r.sku }); } catch { carregarCrossWait(); }
  }
  async function desmarcarCross(r) {
    const ref = refDe(r); if (!ref) return;
    setCrossWait(prev => { const n = new Set(prev); n.delete(ref); return n; });
    try { await api.delete(`/full/cross-wait/${encodeURIComponent(ref)}`); } catch { carregarCrossWait(); }
  }
  async function excluir(sku) {
    setExcluidos(prev => new Set(prev).add(sku)); // otimista
    try { await api.post('/full/excluidos', { sku, motivo: 'tamanho' }); } catch { carregarExcluidos(); }
  }
  async function restaurar(sku) {
    setExcluidos(prev => { const n = new Set(prev); n.delete(sku); return n; });
    try { await api.delete(`/full/excluidos/${encodeURIComponent(sku)}`); } catch { carregarExcluidos(); }
  }

  const janelas = useMemo(() => {
    const arr = janelasTxt.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => n > 0);
    return arr.length ? [...new Set(arr)].sort((a, b) => a - b) : [7, 15, 30];
  }, [janelasTxt]);

  const { rows, meta } = useMemo(
    () => computeReposicao({ resumo, vendas, cross, desempenho, excluidos, params: { regra, diasCobertura: dias, ranking: rank, janelas, reconciliar, limiar2, rankPor } }),
    [resumo, vendas, cross, desempenho, excluidos, regra, dias, rank, janelas, reconciliar, limiar2, rankPor]
  );

  // Rascunho do "Enviar" atrelado ao relatório: cada relatório (datas) tem seu próprio rascunho,
  // então trocar de relatório não vaza quantidade velha.
  const reportId = useMemo(() => `${meta?.dmin ? new Date(meta.dmin).getTime() : 'x'}_${meta?.dmax ? new Date(meta.dmax).getTime() : 'y'}`, [meta?.dmin, meta?.dmax]);
  useEffect(() => { // carrega o rascunho do relatório atual (ou começa limpo)
    try { const s = JSON.parse(localStorage.getItem('full_rascunho::' + reportId) || 'null'); setOverrides(s && typeof s === 'object' ? s : {}); }
    catch { setOverrides({}); }
  }, [reportId]);
  useEffect(() => { // salva a cada mudança (usa o reportId atual do closure; depende só de overrides de propósito)
    try { localStorage.setItem('full_rascunho::' + reportId, JSON.stringify(overrides)); } catch { /* quota/priv */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides]);

  const [alertFiltro, setAlertFiltro] = useState(new Set());
  const [crossMax, setCrossMax] = useState('');       // filtro: cross ≤ crossMax
  const [soComEnvio, setSoComEnvio] = useState(false); // filtro: esconder Enviar = 0
  const [esconderComQtd, setEsconderComQtd] = useState(false); // filtro: esconder Enviar > 0
  const [soComComentario, setSoComComentario] = useState(false); // filtro: só linhas com comentário
  const [sel, setSel] = useState(new Set()); // seleção em lote (keys das linhas)
  const [alertMenu, setAlertMenu] = useState(false);   // dropdown de alertas no cabeçalho
  const [notando, setNotando] = useState(null);        // ref da linha com editor de nota aberto
  const [acaoMenu, setAcaoMenu] = useState(null);      // key da linha com o menu "⋮" aberto
  const finalOf = (r) => (overrides[r.key] != null ? overrides[r.key] : 0);
  // Alertas da linha + selo de "cross esgotado" (aguardando / voltou), derivado do estado persistido
  const alertasDe = (r) => {
    const base = r.alertas || [];
    const ref = refDe(r);
    if (ref && crossWait.has(ref)) return [...base, r.crossSku > 0 ? 'cross voltou' : 'aguardando cross'];
    return base;
  };

  const view = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = rows;
    // Por padrão mostra só os "melhores" (Top N); "Ver todos" libera o resto
    if (!verTodos) arr = arr.filter(r => r.melhor);
    // "Todos" oculta os "Não enviar"; o chip "Não enviar" mostra só eles
    if (decFiltro === 'Todos') arr = arr.filter(r => r.decisao !== 'Não enviar');
    else arr = arr.filter(r => r.decisao === decFiltro);
    // Filtro por alertas (multi, OR)
    if (alertFiltro.size) arr = arr.filter(r => alertasDe(r).some(a => alertFiltro.has(a)));
    // Filtro de coluna: cross ≤ crossMax
    if (crossMax !== '' && !isNaN(parseInt(crossMax, 10))) { const m = parseInt(crossMax, 10); arr = arr.filter(r => (r.crossSku || 0) <= m); }
    // Filtro de coluna: esconder só as linhas com Enviar explicitamente 0 (mantém as em branco)
    if (soComEnvio) arr = arr.filter(r => overrides[r.key] !== 0);
    if (esconderComQtd) arr = arr.filter(r => !(overrides[r.key] > 0));
    // Filtro por tipo de envio (Geral/Grade)
    if (tipoSel.size < 2) arr = arr.filter(r => tipoSel.has(tipoDe(r)));
    // Filtro: só linhas com comentário
    if (soComComentario) arr = arr.filter(r => (notes[refDe(r)] || '').trim());
    if (q) {
      const qm = q.replace(/^mlb/, '');
      arr = arr.filter(r =>
        r.sku.toLowerCase().includes(q) || (r.produto || '').toLowerCase().includes(q) || r.codigoMl.toLowerCase().includes(q) ||
        String(r.anuncio || '').toLowerCase().includes(qm) ||
        (r.anuncios || []).some(a => String(a.mlb || '').toLowerCase().includes(qm)));
    }
    const key = sort.key, mul = sort.dir === 'asc' ? 1 : -1;
    const val = (r) => key === 'rqtd' ? (r.rankQtd ?? 1e9) : key === 'rval' ? (r.rankValor ?? 1e9) : key === 'sugestao' ? finalOf(r) : key === 'vel' ? r.velEsc : key === 'cobertura' ? (r.coberturaDias ?? 1e9) : key === 'afetatempo' ? (r.afetamTempo || 0) : key === 'estoque' ? r.estoque : key === 'un' ? (r.perf?.un || 0) : key === 'rs' ? (r.perf?.receita || 0) : key === 'sku' ? r.sku : r.velEsc;
    return [...arr].sort((a, b) => {
      const va = val(a), vb = val(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * mul;
    });
  }, [rows, busca, sort, overrides, decFiltro, verTodos, alertFiltro, crossWait, crossMax, soComEnvio, esconderComQtd, tipoSel, gradeSet, soComComentario, notes]);

  // Alertas presentes (para os chips de filtro), com contagem, respeitando "Só os melhores"
  const alertasDisp = useMemo(() => {
    const c = new Map();
    for (const r of (verTodos ? rows : rows.filter(r => r.melhor)))
      for (const a of alertasDe(r)) c.set(a, (c.get(a) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, verTodos, crossWait]);
  const toggleAlerta = (a) => setAlertFiltro(prev => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; });
  // Anúncios marcados cujo estoque do cross voltou (crossSku > 0)
  const crossVoltouN = useMemo(() => rows.filter(r => { const ref = refDe(r); return ref && crossWait.has(ref) && r.crossSku > 0; }).length, [rows, crossWait]);
  const filtrarCrossVoltou = () => {
    const ativo = alertFiltro.size === 1 && alertFiltro.has('cross voltou');
    if (ativo) { setAlertFiltro(new Set()); return; }
    setVerTodos(true); setDecFiltro('Todos'); setAlertFiltro(new Set(['cross voltou']));
  };
  const comComentarioN = useMemo(() => rows.filter(r => (notes[refDe(r)] || '').trim()).length, [rows, notes]);
  // Painel de resumo/saúde — números sobre TODAS as linhas
  const resumoFull = useMemo(() => {
    let unEnv = 0, unGeral = 0, unGrade = 0, linhasEnv = 0, sug = 0, sugGeral = 0, sugGrade = 0, tempoUn = 0, tempoProd = 0, crossEsg = 0;
    for (const r of rows) {
      const grade = gradeSet.has(refDe(r));
      const f = overrides[r.key] != null ? overrides[r.key] : 0;
      if (f > 0) { unEnv += f; linhasEnv++; if (grade) unGrade += f; else unGeral += f; }
      // Sugestão respeita o filtro Top N + pedido/valor mínimo (só os "melhores")
      if (r.melhor) { const s = r.final || 0; sug += s; if (grade) sugGrade += s; else sugGeral += s; }
      if (r.afetamTempo > 0) { tempoUn += r.afetamTempo; tempoProd++; }
      if (refDe(r) && crossWait.has(refDe(r))) crossEsg++;
    }
    return { unEnv, unGeral, unGrade, linhasEnv, sug, sugGeral, sugGrade, tempoUn, tempoProd, crossEsg };
  }, [rows, overrides, gradeSet, crossWait]);
  const temFiltro = busca || decFiltro !== 'Todos' || alertFiltro.size || crossMax !== '' || soComEnvio || esconderComQtd || tipoSel.size < 2 || soComComentario;
  const limparFiltros = () => { setBusca(''); setDecFiltro('Todos'); setAlertFiltro(new Set()); setCrossMax(''); setSoComEnvio(false); setEsconderComQtd(false); setTipoSel(new Set(['geral', 'grade'])); setSoComComentario(false); };
  const toggleTipoSel = (t) => setTipoSel(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n.size ? n : new Set(['geral', 'grade']); });

  // ---- Seleção em lote ----
  const toggleSel = (key) => setSel(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const limparSel = () => setSel(new Set());
  // linhas selecionadas (objetos r)
  const linhasSel = () => rows.filter(r => sel.has(r.key));
  const usarSugSel = () => setOverrides(prev => { const n = { ...prev }; for (const r of linhasSel()) n[r.key] = r.final || 0; return n; });
  const zerarSel = () => setOverrides(prev => { const n = { ...prev }; for (const r of linhasSel()) n[r.key] = 0; return n; });
  const gradeSel = async (grade) => { for (const r of linhasSel()) { if (!refDe(r)) continue; if (grade) await marcarGrade(r); else await desmarcarGrade(r); } };
  const naoEnviarSel = async () => { for (const r of linhasSel()) await excluir(r.sku); };

  // Contadores dos chips de decisão respeitam o "Só os melhores"
  const baseRows = useMemo(() => verTodos ? rows : rows.filter(r => r.melhor), [rows, verTodos]);
  const cont = useMemo(() => {
    const c = { Todos: 0 };
    for (const r of baseRows) { c[r.decisao] = (c[r.decisao] || 0) + 1; if (r.decisao !== 'Não enviar') c.Todos++; }
    return c;
  }, [baseRows]);

  // Totais respeitam o filtro atual (view)
  const totalFinal = view.reduce((s, r) => s + finalOf(r), 0);
  const totalSugestao = view.reduce((s, r) => s + (r.final || 0), 0);
  const linhasEnvio = view.filter(r => finalOf(r) > 0).length;

  // Preencher/limpar o campo Enviar com a sugestão viável (r.final)
  function usarSugestoes() { setOverrides(prev => { const n = { ...prev }; for (const r of view) n[r.key] = r.final || 0; return n; }); }
  function limparEnvios() { setOverrides(prev => { const n = { ...prev }; for (const r of view) delete n[r.key]; return n; }); }

  function setFinal(key, v) {
    if (v === '' || v == null) { setOverrides(prev => { const n = { ...prev }; delete n[key]; return n; }); return; }
    const q = Math.max(0, parseInt(v, 10) || 0);
    setOverrides(prev => ({ ...prev, [key]: q }));
  }
  const setOverride = (key, q) => setOverrides(prev => ({ ...prev, [key]: Math.max(0, q || 0) }));
  const noteTimers = useRef({});
  function saveNote(ref, text) {
    setNotes(prev => ({ ...prev, [ref]: text }));
    clearTimeout(noteTimers.current[ref]);
    noteTimers.current[ref] = setTimeout(() => {
      api.put(`/full/notes/${encodeURIComponent(ref)}`, { note: text }).catch(() => {});
    }, 600);
  }
  function clickSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  }

  async function exportarML() {
    // Inclui itens com Enviar > 0 que tenham ao menos SKU + (Código ML OU MLB do anúncio).
    // Candidatos do cross (Promover, ainda sem Código ML) entram pelo SKU + MLB.
    const itens = rows.filter(r => finalOf(r) > 0 && r.sku && (r.codigoMl || r.anuncio) && tipoSel.has(tipoDe(r)));
    if (itens.length === 0) { setMsg('Nenhum item para exportar.'); return; }
    const sufTipo = tipoSel.size < 2 ? (tipoSel.has('grade') ? 'grade_' : 'geral_') : '';
    try {
      const XLSX = await import('xlsx');
      const buf = await (await fetch(moldeUrl)).arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets['Seleção de produtos'];
      let rr = 6;
      for (const r of itens) {
        XLSX.utils.sheet_add_aoa(ws, [[r.sku, String(r.gtin || ''), String(r.codigoMl || ''), String(r.anuncio || ''), '', finalOf(r)]], { origin: 'A' + rr });
        rr++;
      }
      ws['!ref'] = 'A1:F' + (rr - 1);
      const d = new Date();
      const nome = `envio_full_${sufTipo}${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(2)}.xlsx`;
      XLSX.writeFile(wb, nome);
      const semCml = itens.filter(r => !r.codigoMl).length;
      setMsg(`✅ Planilha do ML gerada (${itens.length} itens).` + (semCml ? ` (${semCml} sem Código ML — vão pelo SKU + MLB; confira se o ML aceita.)` : ''));
    } catch (err) {
      setMsg('Erro ao gerar a planilha: ' + (err.message || err));
    }
  }
  // Carregar um envio salvo para edição: aplica as quantidades como overrides (casa por key; fallback por Código ML).
  useEffect(() => {
    if (!envioEdit) return;
    const ov = {};
    for (const it of (envioEdit.items || [])) {
      const k = it.key || it.codigo_ml || (it.sku ? 'cross:' + it.sku : '');
      if (k) ov[k] = Number(it.qty) || 0;
    }
    setOverrides(ov);
    setEnvioId(envioEdit.id);
    setEnvioNome(envioEdit.name || '');
    setMsg(`✏️ Editando o envio salvo "${envioEdit.name || ''}". Ajuste as quantidades e clique em "Atualizar envio".`);
    if (onEditConsumed) onEditConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envioEdit]);

  async function salvar(asNew) {
    const sugerido = envioId && !asNew ? envioNome : `Envio Full ${new Date().toLocaleDateString('pt-BR')}`;
    const nome = window.prompt(envioId && !asNew ? 'Atualizar o envio (nome):' : 'Nome do novo envio:', sugerido);
    if (!nome || !nome.trim()) return;
    const items = rows.filter(r => finalOf(r) > 0 && tipoSel.has(tipoDe(r)))
      .map(r => ({
        codigo_ml: r.codigoMl, sku: r.sku, anuncio: r.anuncio || '', key: r.key, qty: finalOf(r),
        // snapshot p/ editar depois sem os relatórios
        gtin: r.gtin || '', titulo: r.tituloTop || r.produto || '', vels: r.vels || [], vel: r.velEsc,
        estoque: r.estoque, cross: r.crossSku, sugestao: r.sugestao, decisao: r.decisao || '',
        cobertura: r.coberturaDias ?? null, afeta_tempo: r.afetamTempo || 0,
      }));
    if (items.length === 0) { setMsg('Nenhuma quantidade a enviar.'); return; }
    const params = { regra, diasCobertura: dias, janelas: meta.janelas, span: meta.realSpan };
    setSaving(true); setMsg('');
    try {
      if (envioId && !asNew) {
        await api.put(`/full/shipments/${envioId}`, { name: nome.trim(), params, items });
        setEnvioNome(nome.trim());
        setMsg('✅ Envio atualizado! As alterações ficam salvas para editar depois.');
      } else {
        const res = await api.post('/full/shipments', { name: nome.trim(), params, items });
        setEnvioId(res.data?.id || null);
        setEnvioNome(nome.trim());
        setMsg('✅ Envio salvo! Fica em "envios salvos" e pode ser alterado depois (botão Editar).');
      }
      const r = await api.get('/full/shipments/historico');
      const map = {}; (r.data || []).forEach(x => { map[x.codigo_ml] = Number(x.total) || 0; });
      setHistorico(map);
    } catch (err) {
      setMsg('Erro ao salvar: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  }

  // Salva a lista de produtos com "unidades em tempo de estoque" (armazenagem) para
  // encaminhar às trilhas de revisão de Anúncio e Preço (tópico "Tempo de estoque").
  async function salvarTempoEstoque() {
    const itens = rows.filter(r => r.afetamTempo > 0).map(r => ({
      ref: refDe(r),
      codigo_ml: r.codigoMl || '',
      sku: r.sku,
      anuncio: r.anuncio || '',
      titulo: r.tituloTop || r.produto || '',
      estoque_full: r.estoque,
      media_venda: r.velEsc,
      vels: r.vels || [],
      janelas: meta.janelas || [7, 15, 30],
      span: meta.realSpan || null,
      un_tempo: r.afetamTempo,
      un_vendidas: r.perf?.un || 0,
      cobertura: r.coberturaDias ?? null,
    }));
    if (itens.length === 0) { setMsg('Nenhum produto com unidades em tempo de estoque.'); return; }
    const nome = window.prompt('Nome da lista de tempo de estoque:', `Tempo de estoque ${new Date().toLocaleDateString('pt-BR')}`);
    if (!nome || !nome.trim()) return;
    setSaving(true); setMsg('');
    try {
      await api.post('/full/tempo-estoque', { name: nome.trim(), items: itens });
      setMsg(`✅ Lista salva (${itens.length} produtos). Veja no tópico "Tempo de estoque" para encaminhar às revisões.`);
    } catch (err) {
      setMsg('Erro ao salvar a lista: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  }

  const th = (key, label, extra) => (
    <th onClick={key ? () => clickSort(key) : undefined}
      style={{ cursor: key ? 'pointer' : 'default', whiteSpace: 'nowrap', ...(extra || {}) }}>
      {label}{sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div>
      {/* Reconciliação de anúncios migrados */}
      {meta.reconciliadas.total > 0 && (
        <div className="alert" style={{ marginBottom: '10px', background: '#e6fffa', border: '1px solid #38b2ac', color: '#234e52' }}>
          🔗 <b>{int(meta.reconciliadas.total)}</b> vendas de anúncios migrados atribuídas ao Código ML certo (velocidade corrigida).
          <button className="btn-outline" style={{ marginLeft: '10px', padding: '3px 10px', fontSize: '12px' }} onClick={() => setShowRec(v => !v)}>
            {showRec ? 'ocultar' : 'ver lista'}
          </button>
          {showRec && (
            <div style={{ marginTop: '8px', maxHeight: '180px', overflowY: 'auto', fontSize: '12.5px' }}>
              {meta.reconciliadas.lista.slice(0, 100).map((o, i) => (
                <div key={i}>• {int(o.un)}× <b>{o.sku}</b> — anúncio {o.anuncio} → {o.destinos.join(', ')}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Conferência vs ML (informativo — divergência é esperada durante a migração do ML) */}
      <div className="alert" style={{ marginBottom: '10px', background: meta.validacao.pct > 40 ? '#fff5f5' : '#f7fafc', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '13px' }}>
        📋 Conferência vs "Vendas 30 dias" do ML: {meta.validacao.divergentes}/{meta.validacao.comparaveis} Códigos ML diferem &gt;2 un ({meta.validacao.pct.toFixed(0)}%).
        <span style={{ color: 'var(--text-muted)' }}> Parte é esperada (migração de anúncios). Só é sinal de alerta se subir muito de repente.</span>
      </div>
      {/* Órfãs restantes (cross-only ou migração não resolvida) */}
      <div className="alert" style={{ marginBottom: '12px', background: '#fffaf0', border: '1px solid #f6ad55', color: '#744210' }}>
        🧩 Vendas <b>órfãs</b> restantes (anúncio sem grupo, sobretudo do cross): {meta.janelas.map(D => `${D}d ${int(meta.orfas[D])}`).join(' · ')}.
        <button className="btn-outline" style={{ marginLeft: '10px', padding: '3px 10px', fontSize: '12px' }} onClick={() => setShowOrfas(v => !v)}>
          {showOrfas ? 'ocultar' : 'ver lista'}
        </button>
        {showOrfas && (
          <div style={{ marginTop: '8px', maxHeight: '180px', overflowY: 'auto', fontSize: '12.5px' }}>
            {meta.orfas.lista.slice(0, 100).map((o, i) => (
              <div key={i}>• {o.un}× <b>{o.sku}</b> — anúncio {o.anuncio} — {o.titulo}</div>
            ))}
          </div>
        )}
      </div>

      {/* Parâmetros */}
      <div className="card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={styles.group}>
            <span style={styles.label}>Regra</span>
            {['MAX', 'MEDIA', 'MEDIANA'].map(r => (
              <button key={r} onClick={() => setRegra(r)} style={{ ...styles.chip, ...(regra === r ? styles.chipOn : {}) }}>{r}</button>
            ))}
          </div>
          <div style={styles.group}>
            <span style={styles.label}>Dias de cobertura</span>
            {[15, 30, 45, 60].map(d => (
              <button key={d} onClick={() => setDias(d)} style={{ ...styles.chip, ...(dias === d ? styles.chipOn : {}) }}>{d}</button>
            ))}
            <input type="number" min="1" value={dias} onChange={e => setDias(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ ...styles.numInput, width: '64px' }} title="Digite qualquer número de dias de cobertura" />
          </div>
          <div style={styles.group}>
            <span style={styles.label}>Janelas (dias)</span>
            <input value={janelasTxt} onChange={e => setJanelasTxt(e.target.value)} placeholder="7, 15, 30"
              style={{ ...styles.numInput, width: '110px', textAlign: 'left' }} title="Períodos de conferência derivados do relatório (separados por vírgula)" />
          </div>
          <div style={styles.group}>
            <button onClick={() => setReconciliar(v => !v)} style={{ ...styles.chip, ...(reconciliar ? styles.chipOn : {}) }}
              title="Atribui vendas de anúncios migrados ao Código ML correto (pelo SKU/título)">
              {reconciliar ? '✓ ' : ''}Reconciliar migrados
            </button>
          </div>
          <div style={styles.group}>
            <span style={styles.label}>mín. un p/ 2º anúncio</span>
            <input type="number" min="1" value={limiar2} onChange={e => setLimiar2(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={styles.numInput} title="Mínimo de unidades (na maior janela) para sugerir um 2º anúncio de cross de um SKU que já está no Full" />
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Relatório: {n1(meta.realSpan)} dias{meta.dmin && meta.dmax ? ` (${fmtDia(meta.dmin)} → ${fmtDia(meta.dmax)})` : ''}
          </div>
        </div>
        {/* Ranking de "melhores" (define Manter/Promover) */}
        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
          <div style={styles.group}>
            <span style={styles.label}>Rank por</span>
            {[['anuncio', 'Anúncio'], ['sku', 'SKU']].map(([m, lbl]) => (
              <button key={m} onClick={() => setRankPor(m)} style={{ ...styles.chip, ...(rankPor === m ? styles.chipOn : {}) }}>{lbl}</button>
            ))}
          </div>
          <div style={styles.group}>
            <span style={styles.label}>Top N</span>
            <input type="number" min="1" value={rank.topN} onChange={e => setRank(r => ({ ...r, topN: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
              style={styles.numInput} title="Melhores = Top N por quantidade + Top N por receita" />
          </div>
          <div style={styles.group}>
            <span style={styles.label}>pedido mínimo</span>
            <input type="number" min="0" value={rank.corteUn} onChange={e => setRank(r => ({ ...r, corteUn: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
              style={styles.numInput} title="Corte extra: dentro do Top N, exige ≥ este nº de unidades vendidas (0 = sem corte)" />
          </div>
          <div style={styles.group}>
            <span style={styles.label}>valor mínimo</span>
            <input type="number" min="0" value={rank.corteRs} onChange={e => setRank(r => ({ ...r, corteRs: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
              style={styles.numInput} title="Corte extra: dentro do Top N, exige ≥ esta receita (R$) (0 = sem corte). Passa quem atende o pedido mínimo OU o valor mínimo." />
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '12.5px', color: 'var(--text-muted)' }}>
            ranking: unidades e receita (Vendas)
          </div>
        </div>
      </div>

      {/* Painel de resumo/saúde */}
      <div className="card" style={{ marginBottom: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          { lbl: 'A enviar', val: int(resumoFull.unEnv) + ' un', sub: `Geral ${int(resumoFull.unGeral)} · Grade ${int(resumoFull.unGrade)}`, fg: 'var(--brand, #2b6cb0)' },
          { lbl: 'Linhas c/ envio', val: int(resumoFull.linhasEnv) },
          { lbl: 'Sugestão (Top N)', val: int(resumoFull.sug) + ' un', sub: `Geral ${int(resumoFull.sugGeral)} · Grade ${int(resumoFull.sugGrade)}`, fg: 'var(--text-secondary)' },
          { lbl: 'Un. tempo estoque', val: int(resumoFull.tempoUn), sub: `${resumoFull.tempoProd} produtos`, fg: '#c05621' },
          { lbl: 'Avaliar saída', val: int(meta.decisoes?.['Avaliar saída'] || 0), fg: '#975a16' },
          { lbl: 'Cross esgotado', val: int(resumoFull.crossEsg), sub: crossVoltouN > 0 ? `${crossVoltouN} voltaram` : '', fg: '#7b341e', subFg: '#22543d' },
          { lbl: 'Com comentário', val: int(comComentarioN) },
        ].map((c, i) => (
          <div key={i} style={{ flex: '1 1 120px', minWidth: '120px', padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-muted, #f7fafc)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.02em' }}>{c.lbl}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: c.fg || 'var(--text-primary)', lineHeight: 1.15 }}>{c.val}</div>
            {c.sub ? <div style={{ fontSize: '11.5px', color: c.subFg || 'var(--text-muted)' }}>{c.sub}</div> : null}
          </div>
        ))}
      </div>

      {/* Filtro por decisão */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
        <span style={styles.label}>Decisão</span>
        <button onClick={() => setDecFiltro('Todos')} style={{ ...styles.chip, ...(decFiltro === 'Todos' ? styles.chipOn : {}) }}>Todos ({cont.Todos || 0})</button>
        {DECISOES.map(d => (
          <button key={d} onClick={() => setDecFiltro(d)} style={{ ...styles.chip, ...(decFiltro === d ? styles.chipOn : {}) }}>
            {d} ({cont[d] || 0})
          </button>
        ))}
        {(cont['Não enviar'] || 0) > 0 && (
          <button onClick={() => setDecFiltro('Não enviar')} style={{ ...styles.chip, ...(decFiltro === 'Não enviar' ? styles.chipOn : {}) }}>
            🚫 Não enviar ({cont['Não enviar']})
          </button>
        )}
        {crossVoltouN > 0 && (() => { const ativo = alertFiltro.size === 1 && alertFiltro.has('cross voltou'); const s = ALERT_STYLE['cross voltou']; return (
          <button onClick={filtrarCrossVoltou} title="Anúncios cujo estoque do cross voltou — clique para ver só eles"
            style={{ ...styles.chip, marginLeft: '10px', background: s.bg, color: s.fg, borderColor: s.fg, fontWeight: 700, ...(ativo ? { outline: '2px solid ' + s.fg } : {}) }}>
            ✅ cross voltou ({crossVoltouN})
          </button>
        ); })()}
        {comComentarioN > 0 && (
          <button onClick={() => setSoComComentario(v => !v)} title="Mostrar só anúncios com comentário"
            style={{ ...styles.chip, marginLeft: '10px', ...(soComComentario ? { background: '#fefcbf', color: '#744210', borderColor: '#b7791f', fontWeight: 700 } : {}) }}>
            💬 com comentário ({comComentarioN})
          </button>
        )}
        <span style={{ ...styles.label, marginLeft: '10px' }}>Tipo</span>
        {[['geral', 'Geral'], ['grade', 'Grade']].map(([t, lbl]) => (
          <button key={t} onClick={() => toggleTipoSel(t)} title={`Mostrar/exportar Full ${lbl}`}
            style={{ ...styles.chip, ...(tipoSel.has(t) ? styles.chipOn : {}) }}>{lbl}</button>
        ))}
        {temFiltro && (
          <button onClick={limparFiltros} title="Remover todos os filtros (busca, decisão, alertas, cross, esconder 0, tipo)"
            style={{ ...styles.chip, marginLeft: '10px' }}>✕ Limpar filtros</button>
        )}
        <button onClick={() => setVerTodos(v => !v)} style={{ ...styles.chip, ...(verTodos ? {} : styles.chipOn), marginLeft: 'auto' }}
          title={verTodos ? 'Mostrando tudo — clique para ver só os melhores (Top N)' : 'Mostrando só os melhores (Top N) — clique para ver todos'}>
          {verTodos ? 'Ver todos' : `★ Só os melhores (${rows.filter(r => r.melhor).length})`}
        </button>
      </div>

      {/* Filtro por alertas (chips, uma linha) */}
      {alertasDisp.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
          <span style={styles.label}>Alertas</span>
          {alertasDisp.map(([a, n]) => {
            const on = alertFiltro.has(a); const s = ALERT_STYLE[a] || { bg: '#e2e8f0', fg: '#4a5568' };
            return (
              <button key={a} onClick={() => toggleAlerta(a)}
                style={{ ...styles.chip, ...(on ? { background: s.bg, color: s.fg, borderColor: s.fg, fontWeight: 700 } : {}) }}>
                {a} ({n})
              </button>
            );
          })}
          {alertFiltro.size > 0 && <button onClick={() => setAlertFiltro(new Set())} style={styles.chip}>limpar alertas</button>}
        </div>
      )}

      {/* Barra de ação */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
        <input placeholder="Buscar SKU / produto / Código ML / MLB" value={busca} onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px' }} />
        <span style={{ fontSize: '13.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>
          Sugestão: {int(totalSugestao)} · <span style={{ color: 'var(--brand, #2b6cb0)' }}>Enviar: {int(totalFinal)}</span> · {linhasEnvio} linhas
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '11.5px' }}> · 💾 rascunho salvo</span>
        </span>
        <button className="btn-outline" onClick={usarSugestoes} title="Preenche o campo Enviar com a sugestão em todas as linhas visíveis">↧ Usar sugestões</button>
        <button className="btn-outline" onClick={limparEnvios} title="Zera o campo Enviar nas linhas visíveis">Limpar</button>
        <button className="btn-outline" onClick={exportarML} title="Gera a planilha no modelo oficial do ML (colunas A–F)">📤 Exportar planilha do ML</button>
        <button className="btn-outline" onClick={salvarTempoEstoque} disabled={saving} title="Salva os produtos com unidades em tempo de estoque para encaminhar às revisões de Anúncio e Preço">⏳ Salvar lista (tempo de estoque)</button>
        {envioId ? (
          <>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title="Você está editando um envio salvo">✏️ Editando: {envioNome}</span>
            <button className="btn-primary" onClick={() => salvar(false)} disabled={saving}>{saving ? 'Salvando...' : '💾 Atualizar envio'}</button>
            <button className="btn-outline" onClick={() => salvar(true)} disabled={saving} title="Salva uma cópia como um novo envio">Salvar como novo</button>
          </>
        ) : (
          <button className="btn-primary" onClick={() => salvar(false)} disabled={saving}>{saving ? 'Salvando...' : '💾 Salvar envio'}</button>
        )}
      </div>
      {msg && <div className="alert alert-success" style={{ marginBottom: '10px' }}>{msg}</div>}

      {/* Barra de ações em lote (aparece quando há seleção) */}
      {sel.size > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', padding: '8px 12px', background: '#ebf8ff', border: '1px solid #90cdf4', borderRadius: '8px' }}>
          <span style={{ fontWeight: 700, fontSize: '13px' }}>{sel.size} selecionado(s)</span>
          <button className="btn-outline" onClick={usarSugSel} title="Preencher Enviar com a sugestão nas selecionadas">↧ Usar sugestão</button>
          <button className="btn-outline" onClick={zerarSel} title="Zerar o Enviar nas selecionadas">Zerar</button>
          <button className="btn-outline" onClick={() => gradeSel(true)} title="Marcar as selecionadas como Full grade">Marcar Grade</button>
          <button className="btn-outline" onClick={() => gradeSel(false)} title="Voltar as selecionadas para Full geral">Marcar Geral</button>
          <button className="btn-outline" onClick={naoEnviarSel} title="Marcar as selecionadas como Não enviar">🚫 Não enviar</button>
          <button className="btn-outline" onClick={limparSel} style={{ marginLeft: 'auto' }}>✕ Limpar seleção</button>
        </div>
      )}

      {acaoMenu && <div onClick={() => setAcaoMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 25 }} />}
      <div className="card" style={{ overflowX: 'auto' }}>
        <style>{`.repo-tbl{width:auto;}.repo-tbl th,.repo-tbl td{padding:5px 9px;line-height:1.25;vertical-align:middle;}.repo-tbl th{white-space:normal;line-height:1.15;}.repo-tbl th{white-space:normal;line-height:1.15;}.repo-tbl th:first-child,.repo-tbl td:first-child{padding-left:4px;}.repo-tbl .btn-outline{padding:2px 6px !important;font-size:11px !important;}`}</style>
        <table className="repo-tbl" style={{ fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }} title="Selecionar todas as linhas visíveis">
                <input type="checkbox" style={{ width: 'auto', margin: 0 }}
                  checked={view.length > 0 && view.every(r => sel.has(r.key))}
                  ref={el => { if (el) el.indeterminate = view.some(r => sel.has(r.key)) && !view.every(r => sel.has(r.key)); }}
                  onChange={e => { const on = e.target.checked; setSel(prev => { const n = new Set(prev); view.forEach(r => on ? n.add(r.key) : n.delete(r.key)); return n; }); }} />
              </th>
              {th('rqtd', 'R.Qtd', { textAlign: 'left' })}
              {th('rval', 'R.Val', { textAlign: 'left' })}
              {th('sku', 'SKU', { textAlign: 'center' })}
              <th style={{ textAlign: 'center' }} title="Título do anúncio (passe o mouse)">Tít.</th>
              <th style={{ textAlign: 'center' }}>MLB</th>
              <th style={{ textAlign: 'center' }}>Código ML</th>
              <th style={{ textAlign: 'center' }}>Decisão</th>
              {th('vel', 'Vel (' + meta.janelas.join('/') + ')', { textAlign: 'center' })}
              {th('un', 'Un', { textAlign: 'center' })}
              {th('rs', 'R$', { textAlign: 'center' })}
              {th('estoque', <>Estq<br />full</>, { textAlign: 'right' })}
              {th('cobertura', 'Cobertura', { textAlign: 'center' })}
              {th('afetatempo', <>Un.<br />tempo estq</>, { textAlign: 'center' })}
              <th style={{ textAlign: 'center' }}>Estq<br />cross</th>
              {th('sugestao', 'Sugestão', { textAlign: 'center' })}
              <th style={{ textAlign: 'center' }}>Enviar</th>
              <th style={{ width: '118px', minWidth: '118px', maxWidth: '118px', textAlign: 'center' }}>Alertas</th>
              <th style={{ textAlign: 'center' }}>Últ.<br />envios</th>
              <th style={{ textAlign: 'center' }}>Tipo</th>
              <th>Ação</th>
            </tr>
            {/* Linha de filtros por coluna */}
            <tr style={{ background: 'var(--bg-muted, #f7fafc)' }}>
              <th colSpan={14}></th>
              <th style={{ textAlign: 'right' }} title="Mostrar só linhas com cross ≤ valor">
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>≤ </span>
                <input type="number" min="0" value={crossMax} onChange={e => setCrossMax(e.target.value)} placeholder="cross"
                  style={{ width: '52px', padding: '2px 4px', textAlign: 'right', border: '1px solid var(--border)', borderRadius: '5px', fontSize: '12px' }} />
              </th>
              <th></th>
              <th style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => setSoComEnvio(v => !v)} title="Ocultar linhas com Enviar = 0"
                    style={{ ...styles.chip, padding: '2px 6px', fontSize: '11px', ...(soComEnvio ? styles.chipOn : {}) }}>esconder 0</button>
                  <button onClick={() => setEsconderComQtd(v => !v)} title="Ocultar linhas com Enviar > 0 (as que você já preencheu)"
                    style={{ ...styles.chip, padding: '2px 6px', fontSize: '11px', ...(esconderComQtd ? styles.chipOn : {}) }}>esconder c/ qtd</button>
                </div>
              </th>
              <th></th>
              <th colSpan={3}></th>
            </tr>
          </thead>
          <tbody>
            {view.map(r => (
              <React.Fragment key={r.key}>
              <tr style={sel.has(r.key) ? { background: '#ebf8ff' } : undefined}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={sel.has(r.key)} onChange={() => toggleSel(r.key)} />
                </td>
                <td style={{ textAlign: 'left', fontWeight: 700, color: r.rankQtd ? 'var(--text-primary)' : 'var(--text-muted)' }} title="posição por quantidade vendida">{r.rankQtd ? '#' + r.rankQtd : '—'}</td>
                <td style={{ textAlign: 'left', fontWeight: 700, color: r.rankValor ? 'var(--text-primary)' : 'var(--text-muted)' }} title="posição por receita">{r.rankValor ? '#' + r.rankValor : '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap', textAlign: 'center' }}>{r.sku}</td>
                <td style={{ textAlign: 'center', cursor: 'pointer' }} title={(r.tituloTop || r.produto || '') + ' — clique para copiar o título'} onClick={() => copiarTitulo(r)}>{copiado === r.key ? '✅' : 'ℹ️'}</td>
                <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px', textAlign: 'center' }}
                  title={(r.anuncios && r.anuncios.length ? r.anuncios : []).map(a => `MLB${a.mlb} · ${int(a.un)}un${a.titulo ? ' · ' + a.titulo : ''}`).join('\n') || 'sem anúncio'}>
                  {r.anuncio ? <>MLB{r.anuncio}{r.anuncios && r.anuncios.length > 1 && <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}> +{r.anuncios.length - 1}</span>}</> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px', textAlign: 'center' }}>
                  {r.codigoMl ? r.codigoMl : <span style={{ color: 'var(--text-muted)' }} title="nunca foi ao Full (adicionar/remover)">—</span>}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ ...(DEC_STYLE[r.decisao] || {}), background: (DEC_STYLE[r.decisao] || {}).bg, color: (DEC_STYLE[r.decisao] || {}).fg, fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>{r.decisao}</span>
                </td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{r.vels.map(v => n1(v)).join('/')}</td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title="unidades vendidas no período (base do ranking)">{int(r.perf?.un)}</td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title="receita no período (base do ranking)">{brl(r.perf?.receita)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <span>{int(r.estoque)}</span><span style={{ width: '15px', display: 'inline-block' }} />
                  </div>
                  {r.aCaminho > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', color: '#2a4365', fontSize: '11px' }} title="unidades a caminho do Full (entrada pendente)">
                      <span>{int(r.aCaminho)}</span><span style={{ width: '15px', display: 'inline-block', textAlign: 'right' }}>🚚</span>
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>{r.coberturaDias == null ? '—' : int(r.coberturaDias) + 'd'}</td>
                <td style={{ textAlign: 'center' }} title="unidades que já contam para a tarifa de Tempo de estoque (parado — risco de armazenagem)">
                  {r.afetamTempo > 0 ? <span style={{ color: '#c05621', fontWeight: 700 }}>{int(r.afetamTempo)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{int(r.crossSku)}</td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{int(r.sugestao)}</td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                    <input type="number" min="0" placeholder="—" value={overrides[r.key] ?? ''} onChange={e => setFinal(r.key, e.target.value)}
                      style={{ width: '58px', height: '26px', boxSizing: 'border-box', padding: '2px 6px', textAlign: 'right', border: '1px solid var(--border)', borderRadius: '6px' }} />
                    <button disabled={!(r.final > 0)} title={r.final > 0 ? `Usar sugestão (${int(r.final)})` : 'Sem sugestão'} onClick={() => r.final > 0 && setOverride(r.key, r.final)}
                      style={{ width: '24px', height: '26px', boxSizing: 'border-box', padding: 0, fontSize: '11px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-muted, #edf2f7)', cursor: r.final > 0 ? 'pointer' : 'default', opacity: r.final > 0 ? 1 : 0.35 }}>↧</button>
                  </div>
                </td>
                <td style={{ width: '118px', minWidth: '118px', maxWidth: '118px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                    {alertasDe(r).map(a => {
                      const s = ALERT_STYLE[a] || { bg: '#e2e8f0', fg: '#4a5568' };
                      return <span key={a} style={{ background: s.bg, color: s.fg, fontSize: '10.5px', fontWeight: 700, padding: '2px 6px', borderRadius: '8px', whiteSpace: 'nowrap' }}>{a}</span>;
                    })}
                  </div>
                </td>
                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{r.codigoMl && historico[r.codigoMl] ? int(historico[r.codigoMl]) : '—'}</td>
                <td style={{ textAlign: 'center' }}>
                  {(() => { const grade = tipoDe(r) === 'grade'; return (
                    <button onClick={() => toggleTipo(r)} title="Alternar entre Full Geral e Full Grade"
                      style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 700, borderRadius: '10px', cursor: 'pointer', border: '1px solid ' + (grade ? '#b7791f' : 'var(--border)'), background: grade ? '#feebc8' : 'var(--bg-muted, #edf2f7)', color: grade ? '#7b341e' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {grade ? 'Grade' : 'Geral'}
                    </button>
                  ); })()}
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                    <button className="btn-outline" title="Opções" onClick={(e) => { if (acaoMenu?.key === r.key) { setAcaoMenu(null); return; } const rc = e.currentTarget.getBoundingClientRect(); setAcaoMenu({ key: r.key, top: rc.bottom + 2, right: window.innerWidth - rc.right }); }}
                      style={{ padding: '2px 7px', fontSize: '13px', lineHeight: 1, fontWeight: 700 }}>⋮</button>
                    {acaoMenu?.key === r.key && (
                      <div style={{ position: 'fixed', zIndex: 30, top: acaoMenu.top, right: acaoMenu.right, background: 'var(--bg, #fff)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,.14)', padding: '4px', minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {r.decisao === 'Não enviar'
                          ? <button className="btn-outline" style={{ padding: '4px 8px', fontSize: '12px', textAlign: 'left' }} onClick={() => { restaurar(r.sku); setAcaoMenu(null); }}>↩ voltar (enviar)</button>
                          : <button className="btn-outline" style={{ padding: '4px 8px', fontSize: '12px', textAlign: 'left' }} onClick={() => { excluir(r.sku); if (refDe(r)) setNotando(refDe(r)); setAcaoMenu(null); }}>🚫 não enviar</button>}
                        {refDe(r) && (crossWait.has(refDe(r))
                          ? <button className="btn-outline" style={{ padding: '4px 8px', fontSize: '12px', textAlign: 'left' }} onClick={() => { desmarcarCross(r); setAcaoMenu(null); }}>aguardando cross ✕</button>
                          : <button className="btn-outline" style={{ padding: '4px 8px', fontSize: '12px', textAlign: 'left' }} onClick={() => { marcarCross(r); setNotando(refDe(r)); setAcaoMenu(null); }}>⛔ cross esgotou</button>)}
                      </div>
                    )}
                    {refDe(r) && (() => { const has = !!(notes[refDe(r)] || '').trim(); const open = notando === refDe(r); return (
                      <button className="btn-outline" title={has ? notes[refDe(r)] : 'Adicionar comentário'} onClick={() => setNotando(open ? null : refDe(r))}
                        style={{ padding: '2px 7px', fontSize: '11.5px', ...(has ? { background: '#fefcbf', borderColor: '#b7791f', color: '#744210', fontWeight: 700 } : {}) }}>💬{has ? '•' : ''}</button>
                    ); })()}
                  </div>
                </td>
              </tr>
              {notando === refDe(r) && refDe(r) && (
                <tr>
                  <td colSpan={21} style={{ background: 'var(--bg-muted, #f7fafc)' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '4px 2px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingTop: '4px' }}>💬 {r.sku}:</span>
                      <textarea autoFocus rows={2} value={notes[refDe(r)] || ''} onChange={e => saveNote(refDe(r), e.target.value)}
                        placeholder="Comentário (ex.: vende ~X/mês; quando o cross voltar, mandar X un)"
                        style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', resize: 'vertical' }} />
                      <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setNotando(null)}>fechar</button>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  group: { display: 'flex', alignItems: 'center', gap: '6px' },
  label: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 },
  chip: { padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'var(--btn-primary)', borderColor: 'var(--btn-primary)', color: '#fff' },
  numInput: { width: '70px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'right' },
};
