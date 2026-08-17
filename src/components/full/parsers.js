// Parsers dos relatórios do módulo Envio Full. Client-side, sob demanda (xlsx).
// Começa com o relatório de estoque do Full (aba "Resumo"). Os parsers de vendas
// e cross entram nas fases de cálculo.

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const txt = (v) => (v == null ? '' : String(v).trim());
// Valor monetário: número puro (SheetJS) ou texto BR "R$ 1.234,56" / "R$ 16.284".
// Em texto BR o ponto é separador de milhar e a vírgula é decimal.
const money = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
};
// Percentual "5,5%" -> 5.5
const pct = (v) => { const s = String(v ?? '').replace('%', '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; };

// Alguns exports do ML têm compressão que a lib xlsx atual não descomprime 100%
// (perde as linhas de cabeçalho). Por isso o parser tem 2 caminhos:
//  1) mapeamento por NOME de coluna (quando o cabeçalho é lido);
//  2) fallback ancorado na coluna "Código ML" + offsets do layout do Resumo.

// Offsets das colunas do Resumo relativos à coluna "Código ML" (base = Código ML).
const RESUMO_OFFSETS = {
  codigoMl: 0, gtin: 1, sku: 2, anuncio: 3, agrupador: 4, produto: 5, tamanho: 6,
  status: 8, oferece: 9, un30: 10, rs30: 11, estMedio: 12, afetamTempo: 13, aCaminho: 14,
  naoAptas: 18, extraviadas: 19, emRevisao: 20, ocupaEspaco: 22,
  boaQualidade: 24, impulsionar: 25, colocarVenda: 26, evitarDescarte: 27, tempo: 28,
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
      aCaminho: col('Unidades a caminho do Full'),
      ocupaEspaco: col('Unidades que ocupam espaço no Full'),
      naoAptas: col('Não aptas para venda'),
      extraviadas: header.findIndex(h => h.startsWith('Extraviadas')),
      emRevisao: col('Em revisão'), evitarDescarte: col('Para evitar descarte'),
      boaQualidade: col('Boa qualidade'), impulsionar: col('Para impulsionar vendas'),
      colocarVenda: col('Para colocar à venda'), tempo: col('Tempo até esgotar estoque'),
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
      aCaminho: num(r[map.aCaminho]),
      ocupaEspaco: num(r[map.ocupaEspaco]),
      naoAptas: num(r[map.naoAptas]),
      extraviadas: num(r[map.extraviadas]),
      emRevisao: num(r[map.emRevisao]),
      evitarDescarte: num(r[map.evitarDescarte]),
      boaQualidade: num(r[map.boaQualidade]),
      impulsionar: num(r[map.impulsionar]),
      colocarVenda: num(r[map.colocarVenda]),
      estoqueFull: num(r[map.boaQualidade]) + num(r[map.impulsionar]) + num(r[map.colocarVenda]),
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

// ===================== Relatório de vendas (Vendas BR) =====================
const MESES = {
  janeiro: 0, fevereiro: 1, 'março': 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};
function parseSaleDate(v) {
  const m = String(v ?? '').match(/(\d{1,2}) de (\S+) de (\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const mo = MESES[m[2].toLowerCase()];
  if (mo == null) return null;
  return new Date(+m[3], mo, +m[1], +m[4], +m[5]);
}
const CANCELADOS = [
  'Cancelada pelo comprador', 'Pacote cancelado pelo Mercado Livre',
  'Venda cancelada. Não envie.', 'Cancelada pelo Mercado Livre',
];
// Classifica o Estado da venda (spec §4.2). Ordem importa.
export function classifyEstado(estado) {
  const e = String(estado || '').trim();
  if (CANCELADOS.includes(e)) return 'cancelamento';
  if (/media[çc][ãa]o/i.test(e)) return 'mediacao';
  if (/devolu[çc][ãa]o/i.test(e) || e === 'Em devolução' || /^Troca entregue/i.test(e)) return 'devolucao';
  return 'valida';
}

export async function parseVendas(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets['Vendas BR'] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Não encontrei a aba de vendas no relatório.');
  const m = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
  const h = m.findIndex(r => Array.isArray(r) && r.some(c => txt(c) === 'SKU'));
  if (h < 0) throw new Error('Não encontrei a coluna "SKU" — confirme se é o relatório de vendas do ML.');
  const hdr = m[h].map(txt);
  const ci = {
    sku: hdr.indexOf('SKU'), estado: hdr.indexOf('Estado'), un: hdr.indexOf('Unidades'),
    data: hdr.indexOf('Data da venda'), titulo: hdr.indexOf('Título do anúncio'), anuncio: hdr.indexOf('# de anúncio'),
    entrega: hdr.indexOf('Forma de entrega'), receita: hdr.indexOf('Receita por produtos (BRL)'),
  };
  if (ci.sku < 0 || ci.un < 0 || ci.estado < 0) throw new Error('Colunas essenciais (SKU/Unidades/Estado) não encontradas no relatório de vendas.');

  const linhas = [];
  const porClasse = { valida: 0, devolucao: 0, mediacao: 0, cancelamento: 0 };
  const estadosDesconhecidos = new Set();
  let dmin = null, dmax = null;
  const KNOWN = new Set([...CANCELADOS, 'Em devolução']);
  for (let i = h + 1; i < m.length; i++) {
    const r = m[i];
    if (!Array.isArray(r)) continue;
    const estado = txt(r[ci.estado]);
    if (/^Pacote de/i.test(estado)) continue; // separador de pacote
    const sku = txt(r[ci.sku]);
    if (!sku) continue;
    const un = num(r[ci.un]);
    const classe = classifyEstado(estado);
    if (classe === 'valida' && estado && !KNOWN.has(estado) && !/venda|entregue|pagamento|enviad|conclu|finaliz/i.test(estado)) {
      estadosDesconhecidos.add(estado);
    }
    porClasse[classe] += un;
    const data = ci.data >= 0 ? parseSaleDate(r[ci.data]) : null;
    if (data) { if (!dmin || data < dmin) dmin = data; if (!dmax || data > dmax) dmax = data; }
    const entrega = ci.entrega >= 0 ? txt(r[ci.entrega]) : '';
    const canal = /full/i.test(entrega) ? 'full' : /coleta/i.test(entrega) ? 'cross' : /flex/i.test(entrega) ? 'flex' : 'outro';
    linhas.push({
      sku,
      anuncio: ci.anuncio >= 0 ? txt(r[ci.anuncio]).replace(/^MLB/i, '') : '',
      titulo: ci.titulo >= 0 ? txt(r[ci.titulo]) : '',
      un, estado, classe, data, canal,
      receita: ci.receita >= 0 ? money(r[ci.receita]) : 0,
    });
  }
  if (linhas.length === 0) throw new Error('Nenhuma venda válida encontrada no relatório.');
  const span = dmin && dmax ? (dmax - dmin) / 86400000 : 0;
  return { linhas, span, porClasse, estadosDesconhecidos: [...estadosDesconhecidos], dmin, dmax };
}

// ===================== Desempenho de anúncios =====================
// Agrega por SKU: unidades, receita, visitas, vendas (pedidos). Opcional.
export async function parseDesempenho(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets['Relatório'] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Não encontrei a aba do relatório de desempenho.');
  const m = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
  const h = m.findIndex(r => Array.isArray(r) && r.some(c => txt(c) === 'ID do anúncio'));
  if (h < 0) throw new Error('Não encontrei "ID do anúncio" — confirme se é o relatório de Desempenho de anúncios.');
  const hdr = m[h].map(txt);
  const ci = {
    sku: hdr.indexOf('SKU'), un: hdr.indexOf('Unidades vendidas'),
    receita: hdr.indexOf('Vendas brutas (BRL)'), visitas: hdr.indexOf('Visitas únicas'),
    vendas: hdr.indexOf('Quantidade de vendas'),
  };
  if (ci.sku < 0 || ci.un < 0) throw new Error('Colunas essenciais (SKU/Unidades vendidas) não encontradas no relatório de desempenho.');
  const bySku = new Map();
  for (let i = h + 1; i < m.length; i++) {
    const r = m[i];
    if (!Array.isArray(r)) continue;
    const sku = txt(r[ci.sku]);
    if (!sku) continue;
    if (!bySku.has(sku)) bySku.set(sku, { un: 0, receita: 0, visitas: 0, vendas: 0 });
    const o = bySku.get(sku);
    o.un += num(r[ci.un]);
    o.receita += ci.receita >= 0 ? money(r[ci.receita]) : 0;
    o.visitas += ci.visitas >= 0 ? num(r[ci.visitas]) : 0;
    o.vendas += ci.vendas >= 0 ? num(r[ci.vendas]) : 0;
  }
  for (const o of bySku.values()) o.conv = o.visitas > 0 ? (o.vendas / o.visitas) * 100 : 0;
  return { bySku };
}

// ===================== Estoque do armazém (cross, CSV) =====================
export async function parseCross(file) {
  const text = await file.text(); // File API decodifica UTF-8
  const linhas = text.split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) throw new Error('CSV do cross vazio ou sem dados.');
  const split = (l) => l.split(';').map(c => c.replace(/^"|"$/g, '').trim());
  const hdr = split(linhas[0]).map(s => s.toLowerCase());
  const ciCod = hdr.findIndex(s => s === 'código' || s === 'codigo' || s === 'sku');
  const ciQtd = hdr.findIndex(s => s.startsWith('quantidade'));
  if (ciCod < 0 || ciQtd < 0) throw new Error('CSV do cross sem colunas "Código"/"Quantidade" — verifique o arquivo.');
  const brNum = (s) => {
    const t = String(s).replace(/\./g, '').replace(',', '.'); // 1.234,00 -> 1234.00
    const n = parseFloat(t); return isNaN(n) ? 0 : n;
  };
  const map = new Map();
  let totalUn = 0;
  for (let i = 1; i < linhas.length; i++) {
    const c = split(linhas[i]);
    const sku = (c[ciCod] || '').toUpperCase();
    if (!sku) continue;
    const q = brNum(c[ciQtd]);
    map.set(sku, (map.get(sku) || 0) + q);
    totalUn += q;
  }
  return { map, skus: map.size, totalUn };
}
