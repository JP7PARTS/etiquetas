// Módulo Envio Full — anúncios marcados como "Full grade" (produtos grandes).
// O padrão é "Full geral"; aqui guardamos só as exceções (grade). Persistente por
// Código ML. Isolado, só admin.
const express = require('express');
const db = require('../../db');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

// Garante a tabela (idempotente) sem depender de rodar o init.sql manualmente em produção.
let ready = null;
const ensureTable = () => {
  if (!ready) ready = db.query(`CREATE TABLE IF NOT EXISTS full_grade (
    codigo_ml VARCHAR(60) PRIMARY KEY,
    sku VARCHAR(100),
    created_by_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(e => { ready = null; throw e; });
  return ready;
};
router.use(async (req, res, next) => { try { await ensureTable(); next(); } catch (e) { console.error('ensure full_grade:', e); res.status(500).json({ error: 'Erro ao preparar tabela' }); } });

// GET / — lista de anúncios marcados como Grade
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT codigo_ml, sku, created_at FROM full_grade ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /full/grade error:', err);
    res.status(500).json({ error: 'Erro ao buscar marcações de grade' });
  }
});

// POST / — { codigo_ml, sku } (upsert por codigo_ml)
router.post('/', async (req, res) => {
  const codigo = String(req.body.codigo_ml || '').trim();
  const sku = String(req.body.sku || '').trim().toUpperCase();
  if (!codigo) return res.status(400).json({ error: 'Código ML é obrigatório' });
  try {
    await db.query(
      `INSERT INTO full_grade (codigo_ml, sku, created_by_name) VALUES ($1, $2, $3)
       ON CONFLICT (codigo_ml) DO UPDATE SET sku = $2, created_by_name = $3, created_at = NOW()`,
      [codigo, sku, req.user.username || req.user.email]
    );
    res.status(201).json({ message: 'Marcado como Full grade', codigo_ml: codigo });
  } catch (err) {
    console.error('POST /full/grade error:', err);
    res.status(500).json({ error: 'Erro ao marcar' });
  }
});

// DELETE /:codigo_ml — volta para Full geral
router.delete('/:codigo_ml', async (req, res) => {
  try {
    await db.query('DELETE FROM full_grade WHERE codigo_ml = $1', [String(req.params.codigo_ml || '').trim()]);
    res.json({ message: 'Voltou para Full geral' });
  } catch (err) {
    console.error('DELETE /full/grade/:codigo_ml error:', err);
    res.status(500).json({ error: 'Erro ao remover marcação' });
  }
});

module.exports = router;
