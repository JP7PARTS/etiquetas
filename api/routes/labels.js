const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Total de módulos de um Code128: start + dados + checksum (11 cada) + stop (13)
function codeModules(sku) {
  return 11 * (sku.length + 2) + 13;
}

// Largura do módulo calculada para o código de barras SEMPRE caber na etiqueta (320 dots)
function getModuleWidth(sku) {
  const usable = 300; // 320 - margens de segurança (quiet zone)
  const mw = Math.floor(usable / codeModules(sku));
  return Math.max(1, Math.min(mw, 3));
}

function normalizeQuantity(quantity) {
  return Math.max(1, Math.min(parseInt(quantity, 10) || 1, 999));
}

function generateZPL(sku, descricao_curta, quantity) {
  const moduleWidth = getModuleWidth(sku);
  const desc = (descricao_curta || sku).replace(/[^\x20-\x7E\xC0-\xFF]/g, '').substring(0, 100);
  const qty = normalizeQuantity(quantity);

  // Centraliza o código de barras horizontalmente na etiqueta
  const barcodeWidth = codeModules(sku) * moduleWidth;
  const barcodeX = Math.max(6, Math.round((320 - barcodeWidth) / 2));

  return `^XA
^PW320
^LL200
^CI28
^FO10,22^A0N,20,20^FB300,2,2,^FD${desc}^FS
^FO${barcodeX},72^BY${moduleWidth}^BCN,88,N,N,N^FD${sku}^FS
^FO10,164^A0N,26,26^FB300,1,,C^FD${sku}^FS
^PQ${qty}
^XZ`;
}

// POST /api/labels/generate
router.post('/generate', authenticate, (req, res) => {
  const { sku, descricao_curta, quantity } = req.body;
  if (!sku || !sku.trim()) {
    return res.status(400).json({ error: 'SKU é obrigatório' });
  }

  const skuClean = sku.trim().toUpperCase();
  const qty = normalizeQuantity(quantity);
  const zpl = generateZPL(skuClean, descricao_curta, qty);

  res.json({
    zpl,
    sku: skuClean,
    descricao_curta: descricao_curta || '',
    quantity: qty,
    moduleWidth: getModuleWidth(skuClean),
  });
});

// POST /api/labels/generate-batch
// Body: { items: [{ sku, descricao_curta, quantity }, ...] }
// Retorna um unico arquivo ZPL com todas as etiquetas concatenadas
router.post('/generate-batch', authenticate, (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos um SKU' });
  }

  const valid = items.filter(it => it && it.sku && it.sku.trim());
  if (valid.length === 0) {
    return res.status(400).json({ error: 'Nenhum SKU válido informado' });
  }

  let totalLabels = 0;
  const blocks = valid.map(it => {
    const skuClean = it.sku.trim().toUpperCase();
    const qty = normalizeQuantity(it.quantity);
    totalLabels += qty;
    return generateZPL(skuClean, it.descricao_curta, qty);
  });

  res.json({
    zpl: blocks.join('\n'),
    count: valid.length,
    totalLabels,
  });
});

module.exports = router;
