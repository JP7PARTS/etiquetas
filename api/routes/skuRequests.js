const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/sku-requests  — operador (ou admin) solicita cadastro de um SKU
router.post('/', authenticate, async (req, res) => {
  const sku = (req.body.sku || '').trim().toUpperCase();
  const titulo = (req.body.titulo || '').trim() || null;
  const local = (req.body.local || '').trim() || null;
  if (!sku) return res.status(400).json({ error: 'SKU é obrigatório' });
  try {
    const result = await db.query(
      `INSERT INTO sku_requests (sku, titulo, local, requested_by, requested_by_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (sku) DO UPDATE SET
         titulo = COALESCE(EXCLUDED.titulo, sku_requests.titulo),
         local = COALESCE(EXCLUDED.local, sku_requests.local),
         requested_by = EXCLUDED.requested_by,
         requested_by_name = EXCLUDED.requested_by_name
       RETURNING *`,
      [sku, titulo, local, req.user.id, req.user.username || req.user.email]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /sku-requests error:', err);
    res.status(500).json({ error: 'Erro ao registrar solicitação' });
  }
});

// GET /api/sku-requests  — lista pendentes (admin)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM sku_requests ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /sku-requests error:', err);
    res.status(500).json({ error: 'Erro ao buscar solicitações' });
  }
});

// GET /api/sku-requests/count  — quantidade de pendentes (admin)
router.get('/count', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT COUNT(*)::int AS count FROM sku_requests');
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /sku-requests/count error:', err);
    res.status(500).json({ error: 'Erro ao contar solicitações' });
  }
});

// DELETE /api/sku-requests/:id  — dispensar (admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM sku_requests WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Solicitação não encontrada' });
    res.json({ message: 'Solicitação removida' });
  } catch (err) {
    console.error('DELETE /sku-requests/:id error:', err);
    res.status(500).json({ error: 'Erro ao remover solicitação' });
  }
});

module.exports = router;
