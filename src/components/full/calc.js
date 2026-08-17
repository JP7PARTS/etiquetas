// Motor de reposição + sortimento do Full (puro, sem React).
// - Reposição do que está no Full: baseada nas vendas do canal Full.
// - Promoção: SKU que vende no cross e não está no Full → sugerir enviar
//   (quantidade pela velocidade do cross), se for "melhor anúncio".
// - Decisão por linha: Manter | Promover | Avaliar saída | Ignorar.
// Reconciliação de anúncios migrados (§4.5) ainda não entra: vendas órfãs
// (anúncio sem grupo) cujo SKU está no Full continuam à parte.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y); const n = a.length;
  if (!n) return 0;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};
const aggreg = (vels, regra) =>
  regra === 'MEDIA' ? vels.reduce((s, v) => s + v, 0) / vels.length :
  regra === 'MEDIANA' ? median(vels) : Math.max(...vels);

// Rank percentílico (0..1) de cada SKU numa métrica
function percentis(entries, get) {
  const sorted = [...entries].sort((a, b) => get(a[1]) - get(b[1]));
  const n = sorted.length;
  const rank = new Map();
  sorted.forEach(([sku], i) => rank.set(sku, n > 1 ? i / (n - 1) : 1));
  return rank;
}

// Conjunto de SKUs "melhores" conforme o método escolhido
function calcMelhores(perfBySku, ranking) {
  const entries = [...perfBySku.entries()];
  const metodo = ranking?.metodo || 'topN';
  const topN = ranking?.topN || 50;
  const set = new Set();
  if (metodo === 'cortes') {
    const cu = ranking?.corteUn || 20, cr = ranking?.corteRs || 500;
    for (const [sku, p] of entries) if (p.un >= cu || p.receita >= cr) set.add(sku);
  } else if (metodo === 'score') {
    const pu = percentis(entries, p => p.un), pr = percentis(entries, p => p.receita), pc = percentis(entries, p => p.conv || 0);
    const score = entries.map(([sku]) => [sku, pu.get(sku) + pr.get(sku) + pc.get(sku)]);
    score.sort((a, b) => b[1] - a[1]);
    score.slice(0, topN).forEach(([sku]) => set.add(sku));
  } else { // topN: união dos top N por quantidade e por valor
    const byUn = [...entries].sort((a, b) => b[1].un - a[1].un).slice(0, topN);
    const byRs = [...entries].sort((a, b) => b[1].receita - a[1].receita).slice(0, topN);
    byUn.forEach(([sku]) => set.add(sku)); byRs.forEach(([sku]) => set.add(sku));
  }
  return set;
}

// vendas: { 7, 15, 30 } (parseVendas); desempenho opcional (parseDesempenho)
export function computeReposicao({ resumo, vendas, cross, desempenho, excluidos, params }) {
  const regra = params?.regra || 'MAX';
  const diasCobertura = params?.diasCobertura || 30;
  const ranking = params?.ranking || { metodo: 'topN', topN: 50 };
  const excl = excluidos instanceof Set ? excluidos : new Set(excluidos || []);
  const janelas = (params?.janelas && params.janelas.length ? params.janelas : [7, 15, 30])
    .map(Number).filter(d => d > 0).sort((a, b) => a - b);

  const reconciliar = params?.reconciliar !== false;
  const anuncioToCml = new Map();
  const skusFull = new Set();
  const skuToCmls = new Map();   // sku -> [{ codigoMl, un30, estoque }]
  const agSkuToCml = new Map();  // `${agrupador}|${sku}` -> codigoMl
  const prodToAg = new Map();    // norm(produto).slice(0,30) -> agrupador
  for (const p of resumo) {
    for (const a of (p.anuncios || [])) anuncioToCml.set(String(a).trim(), p.codigoMl);
    if (p.sku) {
      skusFull.add(p.sku);
      if (!skuToCmls.has(p.sku)) skuToCmls.set(p.sku, []);
      skuToCmls.get(p.sku).push({ codigoMl: p.codigoMl, un30: p.un30 || 0, estoque: p.estoqueFull || 0 });
    }
    if (p.agrupador && p.sku) agSkuToCml.set(p.agrupador + '|' + p.sku, p.codigoMl);
    const p30 = norm(p.produto).slice(0, 30);
    if (p30 && p.agrupador && !prodToAg.has(p30)) prodToAg.set(p30, p.agrupador);
  }

  // Resolve o destino (lista de [codigoMl, peso]) de uma venda órfã cujo SKU está no Full
  function resolverDestino(sku, titulo) {
    const cmls = skuToCmls.get(sku) || [];
    if (cmls.length === 0) return [];
    if (cmls.length === 1) return [[cmls[0].codigoMl, 1]];
    const ag = prodToAg.get(norm(titulo).slice(0, 30));
    const alvo = ag && agSkuToCml.get(ag + '|' + sku);
    if (alvo) return [[alvo, 1]];
    // rateio proporcional: por un30 do ML; fallback estoque; senão igual
    let base = cmls.map(c => c.un30);
    let soma = base.reduce((s, v) => s + v, 0);
    if (soma <= 0) { base = cmls.map(c => c.estoque); soma = base.reduce((s, v) => s + v, 0); }
    if (soma <= 0) return cmls.map(c => [c.codigoMl, 1 / cmls.length]);
    return cmls.map((c, i) => [c.codigoMl, base[i] / soma]);
  }

  return _run({ resumo, vendas, cross, desempenho, excl, params: { regra, diasCobertura, ranking, janelas, reconciliar }, anuncioToCml, skusFull, resolverDestino });
}

function _run({ resumo, vendas, cross, desempenho, excl, params, anuncioToCml, skusFull, resolverDestino }) {
  const { regra, diasCobertura, ranking, janelas, reconciliar } = params;
  const limiar2 = params?.limiar2 != null ? params.limiar2 : 15;
  const DAY = 86400000;
  const maxJ = janelas[janelas.length - 1], minJ = janelas[0];

  // Um único relatório de vendas → derivar as janelas por data da venda
  const linhas = vendas?.linhas || [];
  const dmax = vendas?.dmax || null;
  const dmin = vendas?.dmin || null;
  const realSpan = vendas?.span || (dmin && dmax ? (dmax - dmin) / DAY : 0);
  const dmaxMs = dmax ? dmax.getTime() : null;
  const spanJ = {}, cutoff = {};
  for (const D of janelas) { spanJ[D] = Math.min(D, realSpan || D) || D; cutoff[D] = dmaxMs != null ? dmaxMs - D * DAY : -Infinity; }
  const dentro = (l, D) => l.data == null ? true : l.data.getTime() >= cutoff[D];
  // Janela de 30 dias para a validação vs "Vendas 30 dias" do ML
  const cutoff30 = dmaxMs != null ? dmaxMs - 30 * DAY : -Infinity;
  const dentro30 = (l) => l.data == null ? true : l.data.getTime() >= cutoff30;

  const demCmlFull = new Map();   // cml -> { [D]: qty } canal full
  const mlCheck = new Map();      // cml -> valida+media (relatório inteiro) canal full
  const demSkuCross = new Map();  // sku -> { [D]: qty } canal cross
  const demAnunCross = new Map(); // anuncio -> { win:{[D]:qty}, sku, titulo, un } canal cross
  const receitaSku = new Map();   // sku -> receita (fallback de ranking)
  const unSku = new Map();        // sku -> un (fallback de ranking)
  const orfas = {}; janelas.forEach(D => orfas[D] = 0); orfas.lista = [];
  const orfasP = new Map();
  const reconciliadas = { total: 0, lista: [] };
  const recP = new Map(); // `${anuncio}|${sku}` -> { anuncio, sku, titulo, un, destinos:Set }
  const anunPorCml = new Map(); // cml -> Map(anuncio -> { un, titulo })
  const anunPorSku = new Map(); // sku -> Map(anuncio -> { un, titulo })

  const addAnun = (mapa, chave, l, peso) => {
    if (!chave) return;
    if (!mapa.has(chave)) mapa.set(chave, new Map());
    const m = mapa.get(chave);
    const e = m.get(l.anuncio) || { un: 0, titulo: '' };
    e.un += l.un * peso; if (l.titulo) e.titulo = l.titulo;
    m.set(l.anuncio, e);
  };

  // soma un (com peso) em demCmlFull[cml] nas janelas por data (demanda do Full)
  const addFull = (cml, l, peso) => {
    if (!demCmlFull.has(cml)) demCmlFull.set(cml, {});
    const o = demCmlFull.get(cml);
    for (const D of janelas) if (dentro(l, D)) o[D] = (o[D] || 0) + l.un * peso;
    // Só registra o MLB no detalhamento quando a atribuição é confiável (venda direta
    // ou reconciliação de destino único); rateio proporcional (peso<1) não polui a lista.
    if (peso === 1) addAnun(anunPorCml, cml, l, 1);
  };

  for (const l of linhas) {
    if (l.classe === 'cancelamento') continue;
    unSku.set(l.sku, (unSku.get(l.sku) || 0) + l.un);
    receitaSku.set(l.sku, (receitaSku.get(l.sku) || 0) + (l.receita || 0));
    const cml = anuncioToCml.get(String(l.anuncio).trim());
    if (cml) {
      if (l.canal === 'full') {
        addFull(cml, l, 1);
        // validação (§4.7): conferência DIRETA anúncio→Código ML (canal Full, valida+mediação,
        // últimos 30 dias), independente da reconciliação — alarme de "formato mudou".
        if (l.classe !== 'devolucao' && dentro30(l)) mlCheck.set(cml, (mlCheck.get(cml) || 0) + l.un);
      }
      continue;
    }
    // órfã (anúncio sem grupo no Full)
    // Reconciliação: SÓ vendas do canal Full (migração real de listagem Full → sucessor).
    // Vendas cross de anúncios órfãos (mesmo SKU, título diferente) NÃO entram no Full —
    // são anúncios diferentes; seguem como demanda de cross.
    if (reconciliar && l.canal === 'full' && skusFull.has(l.sku)) {
      const destinos = resolverDestino(l.sku, l.titulo);
      if (destinos.length) {
        for (const [dcml, peso] of destinos) addFull(dcml, l, peso);
        reconciliadas.total += l.un;
        const k = `${l.anuncio}|${l.sku}`;
        const prev = recP.get(k) || { anuncio: l.anuncio, sku: l.sku, titulo: l.titulo, un: 0, destinos: new Set() };
        prev.un += l.un; destinos.forEach(([dc]) => prev.destinos.add(dc)); recP.set(k, prev);
        continue;
      }
    }
    // segue órfã (cross-only, ou migração não resolvida)
    for (const D of janelas) if (dentro(l, D)) orfas[D] += l.un;
    if (l.canal === 'cross') {
      if (!demSkuCross.has(l.sku)) demSkuCross.set(l.sku, {});
      const o = demSkuCross.get(l.sku);
      for (const D of janelas) if (dentro(l, D)) o[D] = (o[D] || 0) + l.un;
      addAnun(anunPorSku, l.sku, l, 1);
      // demanda de cross por anúncio (para candidatos "2º anúncio" de SKU já no Full)
      let a = demAnunCross.get(l.anuncio);
      if (!a) { a = { win: {}, sku: l.sku, titulo: l.titulo, un: 0 }; demAnunCross.set(l.anuncio, a); }
      for (const D of janelas) if (dentro(l, D)) a.win[D] = (a.win[D] || 0) + l.un;
      a.un += l.un; if (l.titulo) a.titulo = l.titulo;
    }
    const k = `${l.anuncio}|${l.sku}`;
    const prev = orfasP.get(k) || { anuncio: l.anuncio, sku: l.sku, titulo: l.titulo, un: 0, inFull: skusFull.has(l.sku) };
    prev.un += l.un; orfasP.set(k, prev);
  }
  orfas.lista = [...orfasP.values()].sort((a, b) => b.un - a.un);
  reconciliadas.lista = [...recP.values()].map(o => ({ ...o, destinos: [...o.destinos] })).sort((a, b) => b.un - a.un);

  // velocidade por janela a partir de um mapa de demanda { [D]: qty }
  const velsDe = (d) => janelas.map(D => spanJ[D] > 0 ? (d[D] || 0) / spanJ[D] : 0);

  // Ranking de "melhores" por SKU
  const perfBySku = new Map();
  if (desempenho?.bySku) {
    for (const [sku, o] of desempenho.bySku) perfBySku.set(sku, { un: o.un, receita: o.receita, conv: o.conv || 0 });
  } else {
    for (const sku of new Set([...unSku.keys(), ...receitaSku.keys()]))
      perfBySku.set(sku, { un: unSku.get(sku) || 0, receita: receitaSku.get(sku) || 0, conv: 0 });
  }
  const melhores = calcMelhores(perfBySku, ranking);
  const perf = (sku) => perfBySku.get(sku) || { un: 0, receita: 0, conv: 0 };

  // Posição no ranking (top 1, 2, 3…) pelos percentis de qtd+valor(+conversão)
  const entriesM = [...perfBySku.entries()];
  const pu = percentis(entriesM, p => p.un), pr = percentis(entriesM, p => p.receita), pc = percentis(entriesM, p => p.conv || 0);
  const scoreOf = (sku) => (pu.get(sku) || 0) + (pr.get(sku) || 0) + (ranking?.metodo === 'score' ? (pc.get(sku) || 0) : 0);
  const rankPosMap = new Map();
  [...melhores].sort((a, b) => scoreOf(b) - scoreOf(a)).forEach((sku, i) => rankPosMap.set(sku, i + 1));

  // ---- Linhas do Full (Resumo) ----
  // Detalhamento por MLB: une os anúncios do Resumo (venda 0 default) com o que foi
  // atribuído (venda direta + reconciliada), ordenado por unidades desc.
  const anunciosDe = (mapa, chave, baseList) => {
    const m = new Map();
    for (const a of (baseList || [])) if (a) m.set(a, { mlb: a, un: 0, titulo: '' });
    for (const [mlb, e] of (mapa.get(chave) || [])) {
      const prev = m.get(mlb) || { mlb, un: 0, titulo: '' };
      prev.un += e.un; if (e.titulo) prev.titulo = e.titulo; m.set(mlb, prev);
    }
    return [...m.values()].sort((a, b) => b.un - a.un);
  };

  let rows = resumo.map(p => {
    const d = demCmlFull.get(p.codigoMl) || {};
    const anuncios = anunciosDe(anunPorCml, p.codigoMl, p.anuncios);
    const vels = velsDe(d);
    const velEsc = vels.length ? aggreg(vels, regra) : 0;
    const estoque = p.estoqueFull || 0;
    const aCaminho = p.aCaminho || 0;              // entrada pendente (já enviada, ainda não disponível)
    const estoqueEfetivo = estoque + aCaminho;
    const sugestao = Math.max(0, Math.ceil(velEsc * diasCobertura - estoqueEfetivo));
    const coberturaDias = velEsc > 0 ? Math.round(estoqueEfetivo / velEsc) : null;
    const melhor = melhores.has(p.sku);
    const vendeFull = (d[maxJ] || 0) > 0;
    let decisao;
    if (excl.has(p.sku)) decisao = 'Não enviar';
    else if (p.semanas != null && p.semanas >= 10 && !melhor) decisao = 'Avaliar saída';
    else if (melhor || vendeFull) decisao = 'Manter';
    else if (estoqueEfetivo > 0) decisao = 'Avaliar saída';
    else decisao = 'Ignorar';
    return {
      key: p.codigoMl, origem: 'full', codigoMl: p.codigoMl, sku: p.sku, produto: p.produto,
      gtin: p.gtin || '', anuncios, anuncio: (anuncios[0] && anuncios[0].mlb) || (p.anuncios && p.anuncios[0]) || '',
      tituloTop: (anuncios[0] && anuncios[0].titulo) || p.produto,
      vels, velEsc, unMax: d[maxJ] || 0, un30ml: p.un30, estoque, aCaminho, coberturaDias, semanas: p.semanas,
      crossSku: cross?.map?.get((p.sku || '').toUpperCase()) || 0,
      sugestao, final: (decisao === 'Manter') ? sugestao : 0,
      melhor, rankPos: rankPosMap.get(p.sku) || null, perf: perf(p.sku), decisao, alertas: [],
    };
  });

  // ---- Candidatos do cross (não estão no Full) ----
  for (const [sku, d] of demSkuCross) {
    if (skusFull.has(sku)) continue; // migrado (SKU está no Full) — fica para a reconciliação
    const vels = velsDe(d);
    const velEsc = vels.length ? aggreg(vels, regra) : 0;
    const crossSku = cross?.map?.get((sku || '').toUpperCase()) || 0;
    const melhor = melhores.has(sku);
    const sugestao = Math.min(Math.max(0, Math.ceil(velEsc * diasCobertura)), crossSku);
    const decisao = excl.has(sku) ? 'Não enviar' : (melhor && crossSku > 0 ? 'Promover' : 'Ignorar');
    const orf = orfas.lista.find(o => o.sku === sku);
    const anuncios = anunciosDe(anunPorSku, sku, []);
    rows.push({
      key: 'cross:' + sku, origem: 'cross', codigoMl: '', sku, produto: orf?.titulo || sku,
      anuncios, anuncio: (anuncios[0] && anuncios[0].mlb) || '', tituloTop: (anuncios[0] && anuncios[0].titulo) || orf?.titulo || sku,
      vels, velEsc, unMax: d[maxJ] || 0, un30ml: null, estoque: 0, semanas: null,
      crossSku, sugestao, final: decisao === 'Promover' ? sugestao : 0,
      melhor, rankPos: rankPosMap.get(sku) || null, perf: perf(sku), decisao, alertas: [],
    });
  }

  // ---- 2º anúncio: candidatos de cross (título diferente) de SKU que JÁ está no Full ----
  for (const [anuncio, a] of demAnunCross) {
    if (!skusFull.has(a.sku)) continue;        // SKU não está no Full → já vira linha cross normal
    if (anuncioToCml.has(anuncio)) continue;   // anúncio já é do Full
    if ((a.win[maxJ] || 0) < limiar2) continue; // abaixo do limiar → cauda, ignora
    const vels = velsDe(a.win);
    const velEsc = vels.length ? aggreg(vels, regra) : 0;
    const crossSku = cross?.map?.get((a.sku || '').toUpperCase()) || 0;
    const sugestao = Math.min(Math.max(0, Math.ceil(velEsc * diasCobertura)), crossSku);
    const decisao = excl.has(a.sku) ? 'Não enviar' : 'Promover';
    rows.push({
      key: 'cand:' + anuncio, origem: 'cross2', codigoMl: '', sku: a.sku, produto: a.titulo || a.sku,
      anuncios: [{ mlb: anuncio, un: a.un, titulo: a.titulo }], anuncio, tituloTop: a.titulo || a.sku,
      vels, velEsc, unMax: a.win[maxJ] || 0, un30ml: null, estoque: 0, semanas: null,
      crossSku, sugestao, final: decisao === 'Promover' ? sugestao : 0,
      melhor: melhores.has(a.sku), rankPos: rankPosMap.get(a.sku) || null, perf: perf(a.sku),
      decisao, alertas: ['SKU já no Full'],
    });
  }

  // Trava do cross por SKU (soma pedida não passa do estoque do armazém)
  const bySku = new Map();
  for (const r of rows) { if (!bySku.has(r.sku)) bySku.set(r.sku, []); bySku.get(r.sku).push(r); }
  for (const [, group] of bySku) {
    const disp = group[0].crossSku;
    const soma = group.reduce((s, r) => s + r.final, 0);
    if (soma <= disp) continue;
    let restante = disp;
    for (const r of [...group].sort((a, b) => b.velEsc - a.velEsc)) {
      const dar = Math.min(r.final, restante); r.final = dar; restante -= dar; r.estouraCross = true;
    }
  }

  // Alertas — tendência = menor janela vs maior janela
  const temTrend = janelas.length >= 2;
  for (const r of rows) {
    const velCurto = r.vels[0] || 0, velLongo = r.vels[r.vels.length - 1] || 0;
    if (r.estouraCross) r.alertas.push('estoura cross');
    if (r.origem === 'full' && r.velEsc > 0 && (r.estoque + (r.aCaminho || 0)) === 0) r.alertas.push('sem estoque full');
    if (r.origem === 'full' && (r.aCaminho || 0) > 0) r.alertas.push('a caminho');
    if (temTrend && velLongo > 0 && velCurto < 0.5 * velLongo) r.alertas.push('caindo forte');
    if (temTrend && velLongo > 0 && velCurto > 1.5 * velLongo) r.alertas.push('subindo forte');
  }

  // Validação vs ML (§4.7) — só linhas do Full
  let divergentes = 0, comparaveis = 0;
  for (const r of rows) {
    if (r.origem !== 'full' || r.un30ml == null) continue;
    comparaveis++;
    if (Math.abs((mlCheck.get(r.codigoMl) || 0) - r.un30ml) > 2) divergentes++;
  }
  const pct = comparaveis ? (divergentes / comparaveis) * 100 : 0;
  const conta = (dec) => rows.filter(r => r.decisao === dec).length;

  return {
    rows,
    meta: {
      regra, diasCobertura, ranking, janelas, spanJ, realSpan, dmin, dmax, orfas, reconciliadas, reconciliar,
      temDesempenho: !!desempenho?.bySku,
      decisoes: { Manter: conta('Manter'), Promover: conta('Promover'), 'Avaliar saída': conta('Avaliar saída'), Ignorar: conta('Ignorar'), 'Não enviar': conta('Não enviar') },
      validacao: { divergentes, comparaveis, pct, ok: pct <= 5 },
      totalTravado: rows.reduce((s, r) => s + r.final, 0),
      linhasComEnvio: rows.filter(r => r.final > 0).length,
    },
  };
}
