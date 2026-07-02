const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/skus
router.get('/', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM skus';
    const params = [];

    if (search && search.trim()) {
      query += ' WHERE sku ILIKE $1 OR descricao_longa ILIKE $1 OR descricao_curta ILIKE $1 OR descricao_curta_2 ILIKE $1';
      params.push(`%${search.trim()}%`);
    }

    query += ' ORDER BY sku ASC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /skus error:', err);
    res.status(500).json({ error: 'Erro ao buscar SKUs' });
  }
});

// GET /api/skus/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM skus WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'SKU não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /skus/:id error:', err);
    res.status(500).json({ error: 'Erro ao buscar SKU' });
  }
});

// POST /api/skus/import  — importa vários SKUs de uma planilha (UPSERT)
router.post('/import', authenticate, requireAdmin, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Nenhum SKU para importar' });
  }

  let processados = 0;
  let ignorados = 0;
  for (const it of items) {
    const sku = (it.sku || '').trim().toUpperCase();
    if (!sku) { ignorados++; continue; }
    try {
      await db.query(
        `INSERT INTO skus (sku, descricao_longa, descricao_curta, descricao_curta_2, local)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (sku) DO UPDATE SET
           descricao_longa = EXCLUDED.descricao_longa,
           descricao_curta = EXCLUDED.descricao_curta,
           descricao_curta_2 = EXCLUDED.descricao_curta_2,
           local = EXCLUDED.local`,
        [sku, it.descricao_longa || null, it.descricao_curta || null, it.descricao_curta_2 || null, it.local || null]
      );
      processados++;
    } catch (err) {
      console.error('Import SKU error (' + sku + '):', err.message);
      ignorados++;
    }
  }

  res.json({ total: items.length, processados, ignorados });
});

// POST /api/skus
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { sku, descricao_longa, descricao_curta, descricao_curta_2, local } = req.body;
  if (!sku) {
    return res.status(400).json({ error: 'SKU é obrigatório' });
  }

  try {
    const result = await db.query(
      'INSERT INTO skus (sku, descricao_longa, descricao_curta, descricao_curta_2, local) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [sku.trim().toUpperCase(), descricao_longa || null, descricao_curta || null, descricao_curta_2 || null, local || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'SKU já existe' });
    }
    console.error('POST /skus error:', err);
    res.status(500).json({ error: 'Erro ao criar SKU' });
  }
});

// PUT /api/skus/:id
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { sku, descricao_longa, descricao_curta, descricao_curta_2, local } = req.body;
  if (!sku) {
    return res.status(400).json({ error: 'SKU é obrigatório' });
  }

  try {
    const result = await db.query(
      'UPDATE skus SET sku = $1, descricao_longa = $2, descricao_curta = $3, descricao_curta_2 = $4, local = $5 WHERE id = $6 RETURNING *',
      [sku.trim().toUpperCase(), descricao_longa || null, descricao_curta || null, descricao_curta_2 || null, local || null, req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'SKU não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'SKU já existe' });
    }
    console.error('PUT /skus/:id error:', err);
    res.status(500).json({ error: 'Erro ao atualizar SKU' });
  }
});

// DELETE /api/skus/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM skus WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'SKU não encontrado' });
    }
    res.json({ message: 'SKU deletado com sucesso' });
  } catch (err) {
    console.error('DELETE /skus/:id error:', err);
    res.status(500).json({ error: 'Erro ao deletar SKU' });
  }
});

module.exports = router;
