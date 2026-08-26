// Embalagens padrão (P/M/G) com medidas conhecidas — usadas para auto-preencher
// as medidas do SKU. Só admin.
const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Garante a tabela (idempotente), sem depender de migração manual.
let ready = null;
const ensureTable = () => {
  if (!ready) ready = db.query(`CREATE TABLE IF NOT EXISTS embalagens (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(60) NOT NULL,
    comprimento_cm NUMERIC(8,1),
    largura_cm NUMERIC(8,1),
    altura_cm NUMERIC(8,1),
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(e => { ready = null; throw e; });
  return ready;
};
router.use(async (req, res, next) => { try { await ensureTable(); next(); } catch (e) { console.error('ensure embalagens:', e); res.status(500).json({ error: 'Erro ao preparar tabela' }); } });

const numOrNull = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

// GET / — lista (qualquer logado, para preencher os selects)
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM embalagens ORDER BY nome ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /embalagens error:', err);
    res.status(500).json({ error: 'Erro ao buscar embalagens' });
  }
});

// POST / — cria (admin)
router.post('/', requireAdmin, async (req, res) => {
  const nome = (req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const result = await db.query(
      'INSERT INTO embalagens (nome, comprimento_cm, largura_cm, altura_cm) VALUES ($1, $2, $3, $4) RETURNING *',
      [nome, numOrNull(req.body.comprimento_cm), numOrNull(req.body.largura_cm), numOrNull(req.body.altura_cm)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /embalagens error:', err);
    res.status(500).json({ error: 'Erro ao criar embalagem' });
  }
});

// PUT /:id — atualiza (admin)
router.put('/:id', requireAdmin, async (req, res) => {
  const nome = (req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const result = await db.query(
      'UPDATE embalagens SET nome = $1, comprimento_cm = $2, largura_cm = $3, altura_cm = $4 WHERE id = $5 RETURNING *',
      [nome, numOrNull(req.body.comprimento_cm), numOrNull(req.body.largura_cm), numOrNull(req.body.altura_cm), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Embalagem não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /embalagens/:id error:', err);
    res.status(500).json({ error: 'Erro ao atualizar embalagem' });
  }
});

// DELETE /:id (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM embalagens WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Embalagem não encontrada' });
    res.json({ message: 'Embalagem excluída' });
  } catch (err) {
    console.error('DELETE /embalagens/:id error:', err);
    res.status(500).json({ error: 'Erro ao excluir embalagem' });
  }
});

module.exports = router;
