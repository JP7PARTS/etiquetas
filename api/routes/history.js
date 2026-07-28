const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function normalizeQuantity(q) {
  return Math.max(1, Math.min(parseInt(q, 10) || 1, 999));
}

// POST /api/history  — registra uma geração de lote (qualquer usuário logado)
router.post('/', authenticate, async (req, res) => {
  const { items, origin } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Nada para registrar' });
  }
  const orig = origin === 'personalizado' ? 'personalizado' : 'lote';

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
      `INSERT INTO print_history (user_id, user_email, items, total_skus, total_labels, origin)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
      [req.user.id, req.user.username || req.user.email, JSON.stringify(clean), clean.length, totalLabels, orig]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /history error:', err);
    res.status(500).json({ error: 'Erro ao registrar histórico' });
  }
});

// Monta o WHERE compartilhado (período + operador) a partir dos query params
function buildFilter(req) {
  const from = req.query.from && req.query.from.trim() ? req.query.from.trim() : null;
  const to = req.query.to && req.query.to.trim() ? req.query.to.trim() : null;
  const operator = req.query.operator && req.query.operator.trim() ? req.query.operator.trim() : null;
  const params = [from, to, operator];
  const where = `
    WHERE ($1::date IS NULL OR created_at::date >= $1::date)
      AND ($2::date IS NULL OR created_at::date <= $2::date)
      AND ($3::text IS NULL OR LOWER(user_email) = LOWER($3))`;
  return { where, params };
}

// GET /api/history  — lista paginada (somente admin)
// params: from, to, operator, limit, offset
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { where, params } = buildFilter(req);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 100000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  try {
    const result = await db.query(
      `SELECT * FROM print_history ${where}
       ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
      [...params, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /history error:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

// GET /api/history/summary  — totais do período (conta tudo, sem teto)
router.get('/summary', authenticate, requireAdmin, async (req, res) => {
  const { where, params } = buildFilter(req);
  try {
    const result = await db.query(
      `SELECT COUNT(*)::int AS geracoes, COALESCE(SUM(total_labels), 0)::int AS etiquetas
       FROM print_history ${where}`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /history/summary error:', err);
    res.status(500).json({ error: 'Erro ao calcular totais' });
  }
});

// GET /api/history/operators  — lista de operadores distintos no histórico (admin)
router.get('/operators', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT user_email FROM print_history WHERE user_email IS NOT NULL ORDER BY user_email ASC`
    );
    res.json(result.rows.map(r => r.user_email));
  } catch (err) {
    console.error('GET /history/operators error:', err);
    res.status(500).json({ error: 'Erro ao buscar operadores' });
  }
});

// GET /api/history/stats  — ranking de uso por SKU (somente admin)
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  const from = req.query.from && req.query.from.trim() ? req.query.from.trim() : null;
  const to = req.query.to && req.query.to.trim() ? req.query.to.trim() : null;
  try {
    const result = await db.query(`
      SELECT s.sku, s.descricao_curta,
        COALESCE(agg.geracoes, 0)::int AS geracoes,
        COALESCE(agg.etiquetas, 0)::int AS etiquetas,
        agg.ultima
      FROM skus s
      LEFT JOIN (
        SELECT UPPER(elem->>'sku') AS sku,
               COUNT(*) AS geracoes,
               SUM((elem->>'quantity')::int) AS etiquetas,
               MAX(ph.created_at) AS ultima
        FROM print_history ph, jsonb_array_elements(ph.items) AS elem
        WHERE ($1::date IS NULL OR ph.created_at::date >= $1::date)
          AND ($2::date IS NULL OR ph.created_at::date <= $2::date)
        GROUP BY UPPER(elem->>'sku')
      ) agg ON agg.sku = UPPER(s.sku)
      ORDER BY etiquetas DESC, geracoes DESC, s.sku ASC
    `, [from, to]);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /history/stats error:', err);
    res.status(500).json({ error: 'Erro ao calcular ranking' });
  }
});

// DELETE /api/history/:id  — exclui um registro (somente admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM print_history WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }
    res.json({ message: 'Registro excluído' });
  } catch (err) {
    console.error('DELETE /history/:id error:', err);
    res.status(500).json({ error: 'Erro ao excluir registro' });
  }
});

module.exports = router;
