// Motor de reposição do Full (puro, sem React). Recebe os relatórios já
// parseados e devolve uma linha por Código ML com velocidade, sugestão de
// envio, trava do cross e alertas. Ver ENVIO_FULL_SPEC §4.
//
// NOTA: a reconciliação de anúncios migrados (§4.5) ainda NÃO entra aqui —
// as vendas cujo anúncio não casa com nenhum grupo são contadas como
// "órfãs" e devolvidas à parte (nunca somem em silêncio).

const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length;
  if (!n) return 0;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};
const agg = (vels, regra) => {
  if (regra === 'MEDIA') return vels.reduce((s, v) => s + v, 0) / vels.length;
  if (regra === 'MEDIANA') return median(vels);
  return Math.max(...vels); // MAX (padrão)
};

// vendas: { 7: parseVendas(), 15: ..., 30: ... }
export function computeReposicao({ resumo, vendas, cross, params }) {
  const regra = params?.regra || 'MAX';
  const diasCobertura = params?.diasCobertura || 30;
  const periodos = [7, 15, 30];

  // Índice anúncio -> Código ML (a partir do Resumo)
  const anuncioToCml = new Map();
  for (const p of resumo) for (const a of (p.anuncios || [])) anuncioToCml.set(String(a).trim(), p.codigoMl);

  // Demanda por Código ML e por período; órfãs à parte
  const demanda = new Map();   // cml -> { 7, 15, 30 }  (valida+devolucao+mediacao)
  const mlCheck = new Map();   // cml -> { 30 }         (valida+mediacao, p/ validação §4.7)
  const orfas = { 7: 0, 15: 0, 30: 0, lista: [] };
  const spanByP = {};

  for (const p of periodos) {
    const v = vendas[p];
    spanByP[p] = v?.span || 0;
    const orfasP = new Map();
    for (const l of (v?.linhas || [])) {
      if (l.classe === 'cancelamento') continue;
      const cml = anuncioToCml.get(String(l.anuncio).trim());
      if (!cml) { // órfã
        orfas[p] += l.un;
        if (p === 30) {
          const k = `${l.anuncio}|${l.sku}`;
          const prev = orfasP.get(k) || { anuncio: l.anuncio, sku: l.sku, titulo: l.titulo, un: 0 };
          prev.un += l.un; orfasP.set(k, prev);
        }
        continue;
      }
      if (!demanda.has(cml)) demanda.set(cml, { 7: 0, 15: 0, 30: 0 });
      demanda.get(cml)[p] += l.un;
      if (p === 30 && l.classe !== 'devolucao') {
        mlCheck.set(cml, (mlCheck.get(cml) || 0) + l.un);
      }
    }
    if (p === 30) orfas.lista = [...orfasP.values()].sort((a, b) => b.un - a.un);
  }

  // Linhas por Código ML
  let rows = resumo.map(p => {
    const d = demanda.get(p.codigoMl) || { 7: 0, 15: 0, 30: 0 };
    const vel = {};
    for (const per of periodos) vel[per] = spanByP[per] > 0 ? d[per] / spanByP[per] : 0;
    const velEsc = agg([vel[7], vel[15], vel[30]], regra);
    const estoque = p.estoqueFull || 0;
    const sugestao = Math.max(0, Math.ceil(velEsc * diasCobertura - estoque));
    const coberturaDias = velEsc > 0 ? estoque / velEsc : null;
    return {
      codigoMl: p.codigoMl, sku: p.sku, produto: p.produto,
      vel7: vel[7], vel15: vel[15], vel30: vel[30], velEsc,
      un7: d[7], un15: d[15], un30: d[30],
      un30ml: p.un30, // número oficial do ML (validação)
      estoque, coberturaDias,
      crossSku: cross?.map?.get((p.sku || '').toUpperCase()) || 0,
      sugestao,
      final: sugestao,   // trava do cross ajusta abaixo
      alertas: [],
    };
  });

  // Trava do cross (§4.9): por SKU, a soma pedida não passa do estoque do armazém
  const bySku = new Map();
  for (const r of rows) {
    if (!bySku.has(r.sku)) bySku.set(r.sku, []);
    bySku.get(r.sku).push(r);
  }
  for (const [sku, group] of bySku) {
    const disp0 = group[0].crossSku;
    const somaSug = group.reduce((s, r) => s + r.sugestao, 0);
    if (somaSug <= disp0) continue; // cabe
    // aloca priorizando maior velocidade até esgotar o cross
    let restante = disp0;
    for (const r of [...group].sort((a, b) => b.velEsc - a.velEsc)) {
      const dar = Math.min(r.sugestao, restante);
      r.final = dar; restante -= dar;
      r.estouraCross = true;
    }
  }

  // Alertas (§4.10)
  for (const r of rows) {
    if (r.estouraCross) r.alertas.push('estoura cross');
    if (r.velEsc > 0 && r.estoque === 0) r.alertas.push('sem estoque full');
    if (r.un7 === 0 && r.un15 === 0 && r.un30 === 0) r.alertas.push('sem venda');
    if (r.vel30 > 0 && r.vel7 < 0.5 * r.vel30) r.alertas.push('caindo forte');
    if (r.vel30 > 0 && r.vel7 > 1.5 * r.vel30) r.alertas.push('subindo forte');
  }

  // Validação vs ML (§4.7): nosso valida+mediacao(30d) vs "Vendas 30 dias" do Resumo
  let divergentes = 0, comparaveis = 0;
  for (const r of rows) {
    if (r.un30ml == null) continue;
    comparaveis++;
    const nosso = mlCheck.get(r.codigoMl) || 0;
    if (Math.abs(nosso - r.un30ml) > 2) divergentes++;
  }
  const pctDiverg = comparaveis ? (divergentes / comparaveis) * 100 : 0;

  return {
    rows,
    meta: {
      regra, diasCobertura, span: spanByP,
      orfas,
      validacao: { divergentes, comparaveis, pct: pctDiverg, ok: pctDiverg <= 5 },
      totalSugerido: rows.reduce((s, r) => s + r.sugestao, 0),
      totalTravado: rows.reduce((s, r) => s + r.final, 0),
      linhasComEnvio: rows.filter(r => r.final > 0).length,
    },
  };
}
