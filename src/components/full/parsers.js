// Parsers dos relatórios do módulo Envio Full. Client-side, sob demanda (xlsx).
// Começa com o relatório de estoque do Full (aba "Resumo"). Os parsers de vendas
// e cross entram nas fases de cálculo.

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const txt = (v) => (v == null ? '' : String(v).trim());

// Alguns exports do ML têm compressão que a lib xlsx atual não descomprime 100%
// (perde as linhas de cabeçalho). Por isso o parser tem 2 caminhos:
//  1) mapeamento por NOME de coluna (quando o cabeçalho é lido);
//  2) fallback ancorado na coluna "Código ML" + offsets do layout do Resumo.

// Offsets das colunas do Resumo relativos à coluna "Código ML" (base = Código ML).
const RESUMO_OFFSETS = {
  codigoMl: 0, gtin: 1, sku: 2, anuncio: 3, agrupador: 4, produto: 5, tamanho: 6,
  status: 8, oferece: 9, un30: 10, rs30: 11, estMedio: 12, afetamTempo: 13,
  naoAptas: 18, extraviadas: 19, emRevisao: 20, ocupaEspaco: 22,
  boaQualidade: 24, evitarDescarte: 27, tempo: 28,
};

const CODIGO_ML_RE = /^[A-Z]{3,5}\d{4,7}$/; // ex.: RIKW39472, ULEV02571, NMVS85899

export async function parseFullResumo(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets['Resumo'] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Não encontrei a aba "Resumo" no relatório do Full.');
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });

  // Caminho 1: cabeçalho por nome
  const hdrIdx = matrix.findIndex(r => Array.isArray(r) && r.some(c => txt(c) === 'Código ML'));
  let map, dataStart;
  if (hdrIdx >= 0) {
    const header = matrix[hdrIdx].map(txt);
    const col = (name) => header.indexOf(name);
    map = {
      codigoMl: col('Código ML'), gtin: col('Código universal'), sku: col('SKU'),
      anuncio: col('# Anúncio'), agrupador: col('Agrupador de variações'), produto: col('Produto'),
      tamanho: col('Tamanho'), status: col('Status do anúncio'), oferece: col('Oferece Full'),
      un30: col('Vendas últimos 30 dias (un.)'), rs30: col('Vendas últimos 30 dias (R$)'),
      estMedio: col('Estoque médio últimos 30 dias (un.)'),
      afetamTempo: col('Unidades que afetam a métrica de Tempo de estoque'),
      ocupaEspaco: col('Unidades que ocupam espaço no Full'),
      naoAptas: col('Não aptas para venda'),
      extraviadas: header.findIndex(h => h.startsWith('Extraviadas')),
      emRevisao: col('Em revisão'), evitarDescarte: col('Para evitar descarte'),
      boaQualidade: col('Boa qualidade'), tempo: col('Tempo até esgotar estoque'),
    };
    dataStart = hdrIdx + 1;
  } else {
    // Caminho 2: fallback ancorado — acha a coluna com mais valores de Código ML
    const base = findCodigoMlColumn(matrix);
    if (base < 0) throw new Error('Não reconheci o relatório do Full (coluna "Código ML" não encontrada). O formato pode ter mudado.');
    map = {};
    for (const k in RESUMO_OFFSETS) map[k] = base + RESUMO_OFFSETS[k];
    dataStart = 0;
  }

  const rows = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const r = matrix[i];
    if (!Array.isArray(r)) continue;
    const codigoMl = txt(r[map.codigoMl]);
    if (!codigoMl || !CODIGO_ML_RE.test(codigoMl)) continue; // linha sem Código ML válido
    const tempoTxt = txt(r[map.tempo]);
    rows.push({
      codigoMl,
      gtin: txt(r[map.gtin]),
      sku: txt(r[map.sku]),
      anuncios: txt(r[map.anuncio]).split('|').map(s => s.trim()).filter(Boolean),
      agrupador: txt(r[map.agrupador]),
      produto: txt(r[map.produto]),
      tamanho: txt(r[map.tamanho]),
      status: txt(r[map.status]),
      oferece: txt(r[map.oferece]),
      un30: num(r[map.un30]),
      rs30: num(r[map.rs30]),
      estMedio: num(r[map.estMedio]),
      afetamTempo: num(r[map.afetamTempo]),
      ocupaEspaco: num(r[map.ocupaEspaco]),
      naoAptas: num(r[map.naoAptas]),
      extraviadas: num(r[map.extraviadas]),
      emRevisao: num(r[map.emRevisao]),
      evitarDescarte: num(r[map.evitarDescarte]),
      boaQualidade: num(r[map.boaQualidade]),
      tempoTxt,
      semanas: parseSemanas(tempoTxt),
      semEstoque: /sem estoque/i.test(tempoTxt),
    });
  }
  if (rows.length === 0) throw new Error('Nenhum produto encontrado na aba "Resumo".');
  return rows;
}

// Coluna cujo conteúdo mais parece "Código ML" nas primeiras linhas de dados.
function findCodigoMlColumn(matrix) {
  const counts = [];
  const lim = Math.min(matrix.length, 60);
  for (let i = 0; i < lim; i++) {
    const r = matrix[i];
    if (!Array.isArray(r)) continue;
    for (let c = 0; c < r.length; c++) {
      if (CODIGO_ML_RE.test(txt(r[c]))) counts[c] = (counts[c] || 0) + 1;
    }
  }
  let best = -1, bestN = 0;
  counts.forEach((n, c) => { if (n > bestN) { bestN = n; best = c; } });
  return bestN >= 3 ? best : -1;
}

// "Até 8 semanas" -> 8 ; "Sem estoque"/"-" -> null
function parseSemanas(t) {
  const m = String(t).match(/(\d+)\s*semana/i);
  return m ? parseInt(m[1], 10) : null;
}
