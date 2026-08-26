const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Garante as colunas de medidas/peso (idempotente), sem depender de migração manual.
let ready = null;
const ensureColumns = () => {
  if (!ready) ready = db.query(`
    ALTER TABLE skus
      ADD COLUMN IF NOT EXISTS comprimento_cm NUMERIC(8,1),
      ADD COLUMN IF NOT EXISTS largura_cm NUMERIC(8,1),
      ADD COLUMN IF NOT EXISTS altura_cm NUMERIC(8,1),
      ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(8,3),
      ADD COLUMN IF NOT EXISTS tipo_envio VARCHAR(20),
      ADD COLUMN IF NOT EXISTS embalagem_id INTEGER
  `).catch(e => { ready = null; throw e; });
  return ready;
};
router.use(async (req, res, next) => { try { await ensureColumns(); next(); } catch (e) { console.error('ensure skus columns:', e); res.status(500).json({ error: 'Erro ao preparar tabela de SKUs' }); } });

// '' / inválido -> null; senão número (medidas/peso)
const numOrNull = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const TIPOS_ENVIO = ['propria', 'padrao', 'sem'];
const tipoEnvio = (v) => TIPOS_ENVIO.includes(v) ? v : null;
const intOrNull = (v) => { if (v === '' || v == null) return null; const n = parseInt(v, 10); return Number.isInteger(n) ? n : null; };

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
        `INSERT INTO skus (sku, descricao_longa, descricao_curta, descricao_curta_2, local, comprimento_cm, largura_cm, altura_cm, peso_kg, tipo_envio, embalagem_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (sku) DO UPDATE SET
           descricao_longa = EXCLUDED.descricao_longa,
           descricao_curta = EXCLUDED.descricao_curta,
           descricao_curta_2 = EXCLUDED.descricao_curta_2,
           local = EXCLUDED.local,
           comprimento_cm = EXCLUDED.comprimento_cm,
           largura_cm = EXCLUDED.largura_cm,
           altura_cm = EXCLUDED.altura_cm,
           peso_kg = EXCLUDED.peso_kg,
           tipo_envio = EXCLUDED.tipo_envio,
           embalagem_id = EXCLUDED.embalagem_id`,
        [sku, it.descricao_longa || null, it.descricao_curta || null, it.descricao_curta_2 || null, it.local || null,
         numOrNull(it.comprimento_cm), numOrNull(it.largura_cm), numOrNull(it.altura_cm), numOrNull(it.peso_kg),
         tipoEnvio(it.tipo_envio), intOrNull(it.embalagem_id)]
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
  const { sku, descricao_longa, descricao_curta, descricao_curta_2, local, comprimento_cm, largura_cm, altura_cm, peso_kg, tipo_envio, embalagem_id } = req.body;
  if (!sku) {
    return res.status(400).json({ error: 'SKU é obrigatório' });
  }

  try {
    const result = await db.query(
      'INSERT INTO skus (sku, descricao_longa, descricao_curta, descricao_curta_2, local, comprimento_cm, largura_cm, altura_cm, peso_kg, tipo_envio, embalagem_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [sku.trim().toUpperCase(), descricao_longa || null, descricao_curta || null, descricao_curta_2 || null, local || null,
       numOrNull(comprimento_cm), numOrNull(largura_cm), numOrNull(altura_cm), numOrNull(peso_kg), tipoEnvio(tipo_envio), intOrNull(embalagem_id)]
    );
    // Cadastrar resolve automaticamente uma eventual solicitação pendente
    await db.query('DELETE FROM sku_requests WHERE UPPER(sku) = UPPER($1)', [sku.trim()]).catch(() => {});
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
  const { sku, descricao_longa, descricao_curta, descricao_curta_2, local, comprimento_cm, largura_cm, altura_cm, peso_kg, tipo_envio, embalagem_id } = req.body;
  if (!sku) {
    return res.status(400).json({ error: 'SKU é obrigatório' });
  }

  try {
    const result = await db.query(
      'UPDATE skus SET sku = $1, descricao_longa = $2, descricao_curta = $3, descricao_curta_2 = $4, local = $5, comprimento_cm = $6, largura_cm = $7, altura_cm = $8, peso_kg = $9, tipo_envio = $10, embalagem_id = $11 WHERE id = $12 RETURNING *',
      [sku.trim().toUpperCase(), descricao_longa || null, descricao_curta || null, descricao_curta_2 || null, local || null,
       numOrNull(comprimento_cm), numOrNull(largura_cm), numOrNull(altura_cm), numOrNull(peso_kg), tipoEnvio(tipo_envio), intOrNull(embalagem_id), req.params.id]
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
