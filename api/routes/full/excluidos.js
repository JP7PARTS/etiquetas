// Módulo Envio Full — SKUs excluídos do Full (ex.: grandes demais). Isolado, só admin.
const express = require('express');
const db = require('../../db');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

// GET / — lista de SKUs excluídos
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT sku, motivo, created_by_name, created_at FROM full_excluidos ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /full/excluidos error:', err);
    res.status(500).json({ error: 'Erro ao buscar excluídos' });
  }
});

// POST / — { sku, motivo } (upsert)
router.post('/', async (req, res) => {
  const sku = String(req.body.sku || '').trim().toUpperCase();
  const motivo = String(req.body.motivo || '').trim() || 'tamanho';
  if (!sku) return res.status(400).json({ error: 'SKU é obrigatório' });
  try {
    await db.query(
      `INSERT INTO full_excluidos (sku, motivo, created_by_name) VALUES ($1, $2, $3)
       ON CONFLICT (sku) DO UPDATE SET motivo = $2, created_by_name = $3, created_at = NOW()`,
      [sku, motivo, req.user.username || req.user.email]
    );
    res.status(201).json({ message: 'Excluído do Full', sku });
  } catch (err) {
    console.error('POST /full/excluidos error:', err);
    res.status(500).json({ error: 'Erro ao excluir' });
  }
});

// DELETE /:sku — remover da lista (voltar a considerar)
router.delete('/:sku', async (req, res) => {
  try {
    await db.query('DELETE FROM full_excluidos WHERE sku = $1', [String(req.params.sku || '').toUpperCase()]);
    res.json({ message: 'Restaurado' });
  } catch (err) {
    console.error('DELETE /full/excluidos/:sku error:', err);
    res.status(500).json({ error: 'Erro ao restaurar' });
  }
});

module.exports = router;
