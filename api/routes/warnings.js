const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/warnings
router.get('/', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM warning_labels';
    const params = [];

    if (search && search.trim()) {
      query += ' WHERE nome ILIKE $1';
      params.push(`%${search.trim()}%`);
    }

    query += ' ORDER BY nome ASC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /warnings error:', err);
    res.status(500).json({ error: 'Erro ao buscar etiquetas de aviso' });
  }
});

// GET /api/warnings/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM warning_labels WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Etiqueta de aviso não encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /warnings/:id error:', err);
    res.status(500).json({ error: 'Erro ao buscar etiqueta de aviso' });
  }
});

// POST /api/warnings
router.post('/', authenticate, async (req, res) => {
  const { nome, zpl } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }
  if (!zpl || !zpl.trim()) {
    return res.status(400).json({ error: 'ZPL é obrigatório' });
  }

  try {
    const result = await db.query(
      'INSERT INTO warning_labels (nome, zpl) VALUES ($1, $2) RETURNING *',
      [nome.trim(), zpl]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /warnings error:', err);
    res.status(500).json({ error: 'Erro ao criar etiqueta de aviso' });
  }
});

// PUT /api/warnings/:id
router.put('/:id', authenticate, async (req, res) => {
  const { nome, zpl } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }
  if (!zpl || !zpl.trim()) {
    return res.status(400).json({ error: 'ZPL é obrigatório' });
  }

  try {
    const result = await db.query(
      'UPDATE warning_labels SET nome = $1, zpl = $2 WHERE id = $3 RETURNING *',
      [nome.trim(), zpl, req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Etiqueta de aviso não encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /warnings/:id error:', err);
    res.status(500).json({ error: 'Erro ao atualizar etiqueta de aviso' });
  }
});

// DELETE /api/warnings/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM warning_labels WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Etiqueta de aviso não encontrada' });
    }
    res.json({ message: 'Etiqueta de aviso deletada com sucesso' });
  } catch (err) {
    console.error('DELETE /warnings/:id error:', err);
    res.status(500).json({ error: 'Erro ao deletar etiqueta de aviso' });
  }
});

module.exports = router;
