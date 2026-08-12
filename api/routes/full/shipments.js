// Módulo Envio Full — envios gerados (histórico). Isolado, só admin.
const express = require('express');
const db = require('../../db');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

function cleanItems(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.map(it => ({
    codigo_ml: String(it.codigo_ml || ''),
    sku: String(it.sku || ''),
    qty: Math.max(0, parseInt(it.qty, 10) || 0),
  })).filter(it => it.codigo_ml || it.sku);
}

// POST / — cria um envio
router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  const items = cleanItems(req.body.items);
  const params = req.body.params && typeof req.body.params === 'object' ? req.body.params : null;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!items || items.length === 0) return res.status(400).json({ error: 'Nenhum item no envio' });
  try {
    const result = await db.query(
      `INSERT INTO full_shipments (name, created_by, created_by_name, params, items)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, created_at`,
      [name, req.user.id, req.user.username || req.user.email, params ? JSON.stringify(params) : null, JSON.stringify(items)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /full/shipments error:', err);
    res.status(500).json({ error: 'Erro ao salvar envio' });
  }
});

// GET / — lista resumida
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, created_by, created_by_name, params, created_at, updated_at,
        COALESCE(jsonb_array_length(items), 0) AS total_linhas,
        (SELECT COALESCE(SUM((e->>'qty')::int), 0) FROM jsonb_array_elements(items) e) AS total_pecas
      FROM full_shipments
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /full/shipments error:', err);
    res.status(500).json({ error: 'Erro ao buscar envios' });
  }
});

// GET /historico — quantidade já enviada por Código ML nos envios anteriores ("últimos envios")
router.get('/historico', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT e->>'codigo_ml' AS codigo_ml,
             SUM((e->>'qty')::int) AS total,
             MAX(fs.created_at) AS ultimo_envio
      FROM full_shipments fs, jsonb_array_elements(fs.items) e
      WHERE COALESCE(e->>'codigo_ml','') <> ''
      GROUP BY e->>'codigo_ml'
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /full/shipments/historico error:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

// GET /:id — envio completo
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM full_shipments WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Envio não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /full/shipments/:id error:', err);
    res.status(500).json({ error: 'Erro ao buscar envio' });
  }
});

// PUT /:id — atualiza itens/nome/params
router.put('/:id', async (req, res) => {
  const items = req.body.items !== undefined ? cleanItems(req.body.items) : null;
  const name = req.body.name !== undefined ? String(req.body.name).trim() : null;
  const params = req.body.params && typeof req.body.params === 'object' ? req.body.params : null;
  if (!items && name === null && !params) return res.status(400).json({ error: 'Nada para atualizar' });
  try {
    const result = await db.query(
      `UPDATE full_shipments SET
         items = COALESCE($1, items),
         name = COALESCE($2, name),
         params = COALESCE($3, params),
         updated_at = NOW()
       WHERE id = $4 RETURNING id, updated_at`,
      [items ? JSON.stringify(items) : null, name || null, params ? JSON.stringify(params) : null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Envio não encontrado' });
    res.json({ message: 'Atualizado', updated_at: result.rows[0].updated_at });
  } catch (err) {
    console.error('PUT /full/shipments/:id error:', err);
    res.status(500).json({ error: 'Erro ao atualizar envio' });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query('DELETE FROM full_shipments WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Envio não encontrado' });
    res.json({ message: 'Envio excluído' });
  } catch (err) {
    console.error('DELETE /full/shipments/:id error:', err);
    res.status(500).json({ error: 'Erro ao excluir envio' });
  }
});

module.exports = router;
