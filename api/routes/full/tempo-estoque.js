// Módulo Envio Full — "Tempo de estoque": listas salvas de produtos que pagam
// tarifa de armazenagem (unidades com tempo de estoque > 0), encaminhadas para
// revisão de Anúncio e de Preço. Comentários datados por anúncio e por trilha.
// Isolado no diretório full/. Leitura/comentário: qualquer logado; criar/excluir: admin.
const express = require('express');
const db = require('../../db');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

// Garante as tabelas (idempotente), sem depender de rodar o init.sql em produção.
let ready = null;
const ensureTables = () => {
  if (!ready) ready = Promise.all([
    db.query(`CREATE TABLE IF NOT EXISTS full_tempo_estoque (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      created_by INTEGER,
      created_by_name VARCHAR(100),
      items JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`),
    db.query(`CREATE TABLE IF NOT EXISTS full_tempo_comentarios (
      id SERIAL PRIMARY KEY,
      ref VARCHAR(60) NOT NULL,
      area VARCHAR(20) NOT NULL,
      status VARCHAR(30),
      texto TEXT,
      created_by_name VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    )`),
  ]).catch(e => { ready = null; throw e; });
  return ready;
};
router.use(async (req, res, next) => { try { await ensureTables(); next(); } catch (e) { console.error('ensure full_tempo_estoque:', e); res.status(500).json({ error: 'Erro ao preparar tabelas' }); } });

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function cleanItems(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.map(it => ({
    ref: String(it.ref || '').slice(0, 60),
    codigo_ml: String(it.codigo_ml || ''),
    sku: String(it.sku || ''),
    anuncio: String(it.anuncio || ''),
    titulo: String(it.titulo || ''),
    estoque_full: num(it.estoque_full),
    media_venda: num(it.media_venda),
    un_tempo: num(it.un_tempo),
    un_vendidas: num(it.un_vendidas),
    cobertura: it.cobertura == null ? null : num(it.cobertura),
  })).filter(it => it.ref || it.sku);
}

// POST / — cria uma lista
router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  const items = cleanItems(req.body.items);
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!items || items.length === 0) return res.status(400).json({ error: 'Nenhum item com tempo de estoque' });
  try {
    const result = await db.query(
      `INSERT INTO full_tempo_estoque (name, created_by, created_by_name, items)
       VALUES ($1, $2, $3, $4) RETURNING id, name, created_at`,
      [name, req.user.id, req.user.username || req.user.email, JSON.stringify(items)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /full/tempo-estoque error:', err);
    res.status(500).json({ error: 'Erro ao salvar lista' });
  }
});

// GET / — resumo das listas
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, created_by_name, created_at,
        COALESCE(jsonb_array_length(items), 0) AS total_itens,
        (SELECT COALESCE(SUM((e->>'un_tempo')::numeric), 0) FROM jsonb_array_elements(items) e) AS total_un_tempo
      FROM full_tempo_estoque
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /full/tempo-estoque error:', err);
    res.status(500).json({ error: 'Erro ao buscar listas' });
  }
});

// GET /comentarios — todos os comentários (o front indexa por ref+area)
router.get('/comentarios', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, ref, area, status, texto, created_by_name, created_at FROM full_tempo_comentarios ORDER BY created_at ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /full/tempo-estoque/comentarios error:', err);
    res.status(500).json({ error: 'Erro ao buscar comentários' });
  }
});

// POST /comentarios — { ref, area, status, texto } (append; qualquer logado)
router.post('/comentarios', async (req, res) => {
  const ref = String(req.body.ref || '').trim().slice(0, 60);
  const area = String(req.body.area || '').trim().toLowerCase();
  const status = req.body.status ? String(req.body.status).trim().slice(0, 30) : null;
  const texto = req.body.texto != null ? String(req.body.texto) : '';
  if (!ref) return res.status(400).json({ error: 'Referência (ref) é obrigatória' });
  if (area !== 'anuncio' && area !== 'preco') return res.status(400).json({ error: 'Área inválida' });
  if (!status && !texto.trim()) return res.status(400).json({ error: 'Informe um status ou um comentário' });
  try {
    const result = await db.query(
      `INSERT INTO full_tempo_comentarios (ref, area, status, texto, created_by_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, ref, area, status, texto, created_by_name, created_at`,
      [ref, area, status, texto, req.user.username || req.user.email]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /full/tempo-estoque/comentarios error:', err);
    res.status(500).json({ error: 'Erro ao salvar comentário' });
  }
});

// GET /:id — lista completa com itens
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM full_tempo_estoque WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Lista não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /full/tempo-estoque/:id error:', err);
    res.status(500).json({ error: 'Erro ao buscar lista' });
  }
});

// DELETE /:id — exclui a lista
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query('DELETE FROM full_tempo_estoque WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Lista não encontrada' });
    res.json({ message: 'Lista excluída' });
  } catch (err) {
    console.error('DELETE /full/tempo-estoque/:id error:', err);
    res.status(500).json({ error: 'Erro ao excluir lista' });
  }
});

module.exports = router;
