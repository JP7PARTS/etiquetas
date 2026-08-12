// Motor de reposição + sortimento do Full (puro, sem React).
// - Reposição do que está no Full: baseada nas vendas do canal Full.
// - Promoção: SKU que vende no cross e não está no Full → sugerir enviar
//   (quantidade pela velocidade do cross), se for "melhor anúncio".
// - Decisão por linha: Manter | Promover | Avaliar saída | Ignorar.
// Reconciliação de anúncios migrados (§4.5) ainda não entra: vendas órfãs
// (anúncio sem grupo) cujo SKU está no Full continuam à parte.

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
  const periodos = [7, 15, 30];

  const anuncioToCml = new Map();
  const skusFull = new Set();
  for (const p of resumo) {
    for (const a of (p.anuncios || [])) anuncioToCml.set(String(a).trim(), p.codigoMl);
    if (p.sku) skusFull.add(p.sku);
  }

  return _run({ resumo, vendas, cross, desempenho, excl, params: { regra, diasCobertura, ranking }, anuncioToCml, skusFull, periodos });
}

function _run({ resumo, vendas, cross, desempenho, excl, params, anuncioToCml, skusFull, periodos }) {
  const { regra, diasCobertura, ranking } = params;
  const demCmlFull = new Map();   // cml -> {7,15,30} canal full
  const mlCheck = new Map();      // cml -> valida+media 30d full
  const demSkuCross = new Map();  // sku -> {7,15,30} canal cross
  const receitaSku = new Map();   // sku -> receita 30d (fallback de ranking)
  const unSku = new Map();        // sku -> un 30d todas as vendas (fallback)
  const orfas = { 7: 0, 15: 0, 30: 0, lista: [] };
  const spanByP = {};
  const temP = {}; // períodos com dados (o cliente pode mandar só o de 30d)

  for (const p of periodos) {
    const v = vendas[p];
    temP[p] = !!(v && v.linhas && v.linhas.length);
    spanByP[p] = v?.span || 0;
    const orfasP = new Map();
    for (const l of (v?.linhas || [])) {
      if (l.classe === 'cancelamento') continue;
      if (p === 30) {
        unSku.set(l.sku, (unSku.get(l.sku) || 0) + l.un);
        receitaSku.set(l.sku, (receitaSku.get(l.sku) || 0) + (l.receita || 0));
      }
      const cml = anuncioToCml.get(String(l.anuncio).trim());
      if (cml) {
        if (l.canal === 'full') {
          if (!demCmlFull.has(cml)) demCmlFull.set(cml, { 7: 0, 15: 0, 30: 0 });
          demCmlFull.get(cml)[p] += l.un;
          if (p === 30 && l.classe !== 'devolucao') mlCheck.set(cml, (mlCheck.get(cml) || 0) + l.un);
        }
        continue;
      }
      // órfã (anúncio sem grupo no Full)
      orfas[p] += l.un;
      if (l.canal === 'cross') {
        if (!demSkuCross.has(l.sku)) demSkuCross.set(l.sku, { 7: 0, 15: 0, 30: 0 });
        demSkuCross.get(l.sku)[p] += l.un;
      }
      if (p === 30) {
        const k = `${l.anuncio}|${l.sku}`;
        const prev = orfasP.get(k) || { anuncio: l.anuncio, sku: l.sku, titulo: l.titulo, un: 0, inFull: skusFull.has(l.sku) };
        prev.un += l.un; orfasP.set(k, prev);
      }
    }
    if (p === 30) orfas.lista = [...orfasP.values()].sort((a, b) => b.un - a.un);
  }

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
  let rows = resumo.map(p => {
    const d = demCmlFull.get(p.codigoMl) || { 7: 0, 15: 0, 30: 0 };
    const vel = {};
    for (const per of periodos) vel[per] = temP[per] && spanByP[per] > 0 ? d[per] / spanByP[per] : 0;
    const velArr = periodos.filter(per => temP[per]).map(per => vel[per]);
    const velEsc = velArr.length ? aggreg(velArr, regra) : 0;
    const estoque = p.estoqueFull || 0;
    const sugestao = Math.max(0, Math.ceil(velEsc * diasCobertura - estoque));
    const melhor = melhores.has(p.sku);
    const vendeFull = d[30] > 0;
    let decisao;
    if (excl.has(p.sku)) decisao = 'Não enviar';
    else if (p.semanas != null && p.semanas >= 10 && !melhor) decisao = 'Avaliar saída';
    else if (melhor || vendeFull) decisao = 'Manter';
    else if (estoque > 0) decisao = 'Avaliar saída';
    else decisao = 'Ignorar';
    return {
      key: p.codigoMl, origem: 'full', codigoMl: p.codigoMl, sku: p.sku, produto: p.produto,
      vel7: vel[7], vel15: vel[15], vel30: vel[30], velEsc,
      un30: d[30], un30ml: p.un30, estoque, semanas: p.semanas,
      crossSku: cross?.map?.get((p.sku || '').toUpperCase()) || 0,
      sugestao, final: (decisao === 'Manter') ? sugestao : 0,
      melhor, rankPos: rankPosMap.get(p.sku) || null, perf: perf(p.sku), decisao, alertas: [],
    };
  });

  // ---- Candidatos do cross (não estão no Full) ----
  for (const [sku, d] of demSkuCross) {
    if (skusFull.has(sku)) continue; // migrado (SKU está no Full) — fica para a reconciliação
    const vel = {};
    for (const per of periodos) vel[per] = temP[per] && spanByP[per] > 0 ? d[per] / spanByP[per] : 0;
    const velArr = periodos.filter(per => temP[per]).map(per => vel[per]);
    const velEsc = velArr.length ? aggreg(velArr, regra) : 0;
    const crossSku = cross?.map?.get((sku || '').toUpperCase()) || 0;
    const melhor = melhores.has(sku);
    const sugestaoBruta = Math.max(0, Math.ceil(velEsc * diasCobertura));
    const sugestao = Math.min(sugestaoBruta, crossSku);
    const decisao = excl.has(sku) ? 'Não enviar' : (melhor && crossSku > 0 ? 'Promover' : 'Ignorar');
    const orf = orfas.lista.find(o => o.sku === sku);
    rows.push({
      key: 'cross:' + sku, origem: 'cross', codigoMl: '', sku, produto: orf?.titulo || sku,
      vel7: vel[7], vel15: vel[15], vel30: vel[30], velEsc,
      un30: d[30], un30ml: null, estoque: 0, semanas: null,
      crossSku, sugestao, final: decisao === 'Promover' ? sugestao : 0,
      melhor, rankPos: rankPosMap.get(sku) || null, perf: perf(sku), decisao, alertas: [],
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

  // Alertas
  for (const r of rows) {
    if (r.estouraCross) r.alertas.push('estoura cross');
    if (r.origem === 'full' && r.velEsc > 0 && r.estoque === 0) r.alertas.push('sem estoque full');
    if (temP[7] && temP[30] && r.vel30 > 0 && r.vel7 < 0.5 * r.vel30) r.alertas.push('caindo forte');
    if (temP[7] && temP[30] && r.vel30 > 0 && r.vel7 > 1.5 * r.vel30) r.alertas.push('subindo forte');
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
      regra, diasCobertura, ranking, span: spanByP, orfas,
      temDesempenho: !!desempenho?.bySku,
      decisoes: { Manter: conta('Manter'), Promover: conta('Promover'), 'Avaliar saída': conta('Avaliar saída'), Ignorar: conta('Ignorar'), 'Não enviar': conta('Não enviar') },
      validacao: { divergentes, comparaveis, pct, ok: pct <= 5 },
      totalTravado: rows.reduce((s, r) => s + r.final, 0),
      linhasComEnvio: rows.filter(r => r.final > 0).length,
    },
  };
}
