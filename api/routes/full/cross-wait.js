// Módulo Envio Full — anúncios marcados como "cross esgotado" (aguardando o estoque
// do armazém voltar). Persistente por Código ML. Isolado, só admin.
const express = require('express');
const db = require('../../db');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

// Garante a tabela (idempotente) sem depender de rodar o init.sql manualmente em produção.
let ready = null;
const ensureTable = () => {
  if (!ready) ready = db.query(`CREATE TABLE IF NOT EXISTS full_cross_wait (
    codigo_ml VARCHAR(60) PRIMARY KEY,
    sku VARCHAR(100),
    created_by_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(e => { ready = null; throw e; });
  return ready;
};
router.use(async (req, res, next) => { try { await ensureTable(); next(); } catch (e) { console.error('ensure full_cross_wait:', e); res.status(500).json({ error: 'Erro ao preparar tabela' }); } });

// GET / — lista de anúncios aguardando o cross voltar
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT codigo_ml, sku, created_at FROM full_cross_wait ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /full/cross-wait error:', err);
    res.status(500).json({ error: 'Erro ao buscar marcações de cross' });
  }
});

// POST / — { codigo_ml, sku } (upsert por codigo_ml)
router.post('/', async (req, res) => {
  const codigo = String(req.body.codigo_ml || '').trim();
  const sku = String(req.body.sku || '').trim().toUpperCase();
  if (!codigo) return res.status(400).json({ error: 'Código ML é obrigatório' });
  try {
    await db.query(
      `INSERT INTO full_cross_wait (codigo_ml, sku, created_by_name) VALUES ($1, $2, $3)
       ON CONFLICT (codigo_ml) DO UPDATE SET sku = $2, created_by_name = $3, created_at = NOW()`,
      [codigo, sku, req.user.username || req.user.email]
    );
    res.status(201).json({ message: 'Marcado como cross esgotado', codigo_ml: codigo });
  } catch (err) {
    console.error('POST /full/cross-wait error:', err);
    res.status(500).json({ error: 'Erro ao marcar' });
  }
});

// DELETE /:codigo_ml — remover a marcação
router.delete('/:codigo_ml', async (req, res) => {
  try {
    await db.query('DELETE FROM full_cross_wait WHERE codigo_ml = $1', [String(req.params.codigo_ml || '').trim()]);
    res.json({ message: 'Marcação removida' });
  } catch (err) {
    console.error('DELETE /full/cross-wait/:codigo_ml error:', err);
    res.status(500).json({ error: 'Erro ao remover marcação' });
  }
});

module.exports = router;
