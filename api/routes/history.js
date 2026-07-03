const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function normalizeQuantity(q) {
  return Math.max(1, Math.min(parseInt(q, 10) || 1, 999));
}

// POST /api/history  — registra uma geração de lote (qualquer usuário logado)
router.post('/', authenticate, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Nada para registrar' });
  }

  const clean = items
    .filter(it => it && it.sku)
    .map(it => ({
      sku: String(it.sku),
      descricao_curta: it.descricao_curta || '',
      quantity: normalizeQuantity(it.quantity),
    }));
  if (clean.length === 0) {
    return res.status(400).json({ error: 'Nenhum item válido' });
  }
  const totalLabels = clean.reduce((s, it) => s + it.quantity, 0);

  try {
    const result = await db.query(
      `INSERT INTO print_history (user_id, user_email, items, total_skus, total_labels)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [req.user.id, req.user.email, JSON.stringify(clean), clean.length, totalLabels]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /history error:', err);
    res.status(500).json({ error: 'Erro ao registrar histórico' });
  }
});

// GET /api/history  — lista (somente admin)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM print_history ORDER BY created_at DESC LIMIT 500'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /history error:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

module.exports = router;
