const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function getModuleWidth(sku) {
  const len = sku.length;
  if (len <= 10) return 3;
  if (len <= 15) return 2;
  return 1;
}

function generateZPL(sku, descricao_curta) {
  const moduleWidth = getModuleWidth(sku);
  const desc = (descricao_curta || sku).replace(/[^\x20-\x7E\xC0-\xFF]/g, '').substring(0, 100);

  return `^XA
^PW320
^LL200
^CI28
^FO10,5^A0N,20,20^FB300,2,2,^FD${desc}^FS
^FO10,50^BY${moduleWidth}^BCN,90,N,N,N^FD${sku}^FS
^FO10,148^A0N,18,18^FB300,1,,C^FD${sku}^FS
^XZ`;
}

// POST /api/labels/generate
router.post('/generate', authenticate, (req, res) => {
  const { sku, descricao_curta } = req.body;
  if (!sku || !sku.trim()) {
    return res.status(400).json({ error: 'SKU é obrigatório' });
  }

  const skuClean = sku.trim().toUpperCase();
  const zpl = generateZPL(skuClean, descricao_curta);

  res.json({
    zpl,
    sku: skuClean,
    descricao_curta: descricao_curta || '',
    moduleWidth: getModuleWidth(skuClean),
  });
});

module.exports = router;
