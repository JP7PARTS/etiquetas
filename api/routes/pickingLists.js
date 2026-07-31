const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/picking-lists  — cria uma lista de picking
router.post('/', authenticate, async (req, res) => {
  const name = (req.body.name || '').trim();
  const items = Array.isArray(req.body.items) ? req.body.items : null;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!items || items.length === 0) return res.status(400).json({ error: 'Nenhum item na lista' });
  const clean = items.map(it => ({
    sku: String(it.sku || ''),
    descricao: it.descricao || '',
    local: it.local || '',
    qty: Math.max(1, parseInt(it.qty, 10) || 1),
    picked: !!it.picked,
  })).filter(it => it.sku);
  try {
    const result = await db.query(
      `INSERT INTO picking_lists (name, created_by, created_by_name, items)
       VALUES ($1, $2, $3, $4) RETURNING id, name, created_at`,
      [name, req.user.id, req.user.username || req.user.email, JSON.stringify(clean)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /picking-lists error:', err);
    res.status(500).json({ error: 'Erro ao salvar lista' });
  }
});

// GET /api/picking-lists  — lista resumida (todos os logados veem)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, created_by, created_by_name, created_at, updated_at,
        COALESCE(jsonb_array_length(items), 0) AS total,
        (SELECT COUNT(*) FROM jsonb_array_elements(items) e WHERE (e->>'picked')::boolean) AS pegos
      FROM picking_lists
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /picking-lists error:', err);
    res.status(500).json({ error: 'Erro ao buscar listas' });
  }
});

// GET /api/picking-lists/:id  — lista completa
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM picking_lists WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Lista não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /picking-lists/:id error:', err);
    res.status(500).json({ error: 'Erro ao buscar lista' });
  }
});

// PUT /api/picking-lists/:id  — atualiza itens (progresso) e/ou nome
router.put('/:id', authenticate, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : null;
  const name = req.body.name !== undefined ? String(req.body.name).trim() : null;
  if (!items && name === null) return res.status(400).json({ error: 'Nada para atualizar' });
  try {
    const result = await db.query(
      `UPDATE picking_lists SET
         items = COALESCE($1, items),
         name = COALESCE($2, name),
         updated_at = NOW()
       WHERE id = $3 RETURNING id`,
      [items ? JSON.stringify(items) : null, name || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Lista não encontrada' });
    res.json({ message: 'Atualizado' });
  } catch (err) {
    console.error('PUT /picking-lists/:id error:', err);
    res.status(500).json({ error: 'Erro ao atualizar lista' });
  }
});

// DELETE /api/picking-lists/:id  — admin ou criador
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const found = await db.query('SELECT created_by FROM picking_lists WHERE id = $1', [req.params.id]);
    if (!found.rows[0]) return res.status(404).json({ error: 'Lista não encontrada' });
    if (req.user.role !== 'admin' && found.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão para excluir esta lista' });
    }
    await db.query('DELETE FROM picking_lists WHERE id = $1', [req.params.id]);
    res.json({ message: 'Lista excluída' });
  } catch (err) {
    console.error('DELETE /picking-lists/:id error:', err);
    res.status(500).json({ error: 'Erro ao excluir lista' });
  }
});

module.exports = router;
