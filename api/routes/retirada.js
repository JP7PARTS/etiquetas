// Solicitar Retirada — worklist de vendas do Full com devolução que precisam de ação
// (reclamar / solicitar retirada). Fluxo: adiciona itens (um por vez) → seleciona vários
// → "reclamar" gera um protocolo e agrupa os itens naquele bloco → acompanha até
// resolvido / não resolvido. Motivos e justificativas são opções editáveis. Só admin.
const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

const MOTIVOS_PADRAO = [
  'Reclamar para colocar na área de não apto',
  'Disponível para retirada',
];
const JUSTIFICATIVAS_PADRAO = [
  'Sem parafuso',
  'Sem dupla face',
  'Faltando uma peça',
  'Projetor',
];

let ready = null;
const ensure = () => {
  if (!ready) ready = (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS retirada_itens (
      id SERIAL PRIMARY KEY,
      qtd INTEGER DEFAULT 1,
      sku VARCHAR(100),
      bling VARCHAR(40),
      ml VARCHAR(40),
      motivo TEXT,
      justificativa TEXT,
      protocolo VARCHAR(40),
      status VARCHAR(20) DEFAULT 'pendente',
      created_by_name VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS retirada_opcoes (
      id SERIAL PRIMARY KEY,
      tipo VARCHAR(20) NOT NULL,
      texto TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    // Semeia as opções padrão só na primeira vez (tabela vazia)
    const c = await db.query('SELECT COUNT(*)::int AS n FROM retirada_opcoes');
    if (c.rows[0].n === 0) {
      for (const t of MOTIVOS_PADRAO) await db.query('INSERT INTO retirada_opcoes (tipo, texto) VALUES ($1, $2)', ['motivo', t]);
      for (const t of JUSTIFICATIVAS_PADRAO) await db.query('INSERT INTO retirada_opcoes (tipo, texto) VALUES ($1, $2)', ['justificativa', t]);
    }
  })().catch(e => { ready = null; throw e; });
  return ready;
};
router.use(async (req, res, next) => { try { await ensure(); next(); } catch (e) { console.error('ensure retirada:', e); res.status(500).json({ error: 'Erro ao preparar tabelas' }); } });

const s = (v, n) => (v == null ? '' : String(v)).slice(0, n);
const qtd = (v) => Math.max(1, parseInt(v, 10) || 1);

// GET / — itens + opções
router.get('/', async (req, res) => {
  try {
    const itens = await db.query('SELECT * FROM retirada_itens ORDER BY created_at DESC');
    const opcoes = await db.query('SELECT id, tipo, texto FROM retirada_opcoes ORDER BY tipo, texto');
    res.json({ itens: itens.rows, opcoes: opcoes.rows });
  } catch (e) { console.error('GET /retirada:', e); res.status(500).json({ error: 'Erro ao buscar dados' }); }
});

// POST /itens — adiciona um item (pendente)
router.post('/itens', async (req, res) => {
  const b = req.body || {};
  try {
    const r = await db.query(
      `INSERT INTO retirada_itens (qtd, sku, bling, ml, motivo, justificativa, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [qtd(b.qtd), s(b.sku, 100).toUpperCase(), s(b.bling, 40), s(b.ml, 40), s(b.motivo, 300), s(b.justificativa, 500), req.user.username || req.user.email]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('POST /retirada/itens:', e); res.status(500).json({ error: 'Erro ao adicionar item' }); }
});

// PUT /itens/:id — edita um item
router.put('/itens/:id', async (req, res) => {
  const b = req.body || {};
  const set = [], vals = []; let i = 1;
  const add = (col, val) => { set.push(`${col} = $${i++}`); vals.push(val); };
  if (b.qtd !== undefined) add('qtd', qtd(b.qtd));
  if (b.sku !== undefined) add('sku', s(b.sku, 100).toUpperCase());
  if (b.bling !== undefined) add('bling', s(b.bling, 40));
  if (b.ml !== undefined) add('ml', s(b.ml, 40));
  if (b.motivo !== undefined) add('motivo', s(b.motivo, 300));
  if (b.justificativa !== undefined) add('justificativa', s(b.justificativa, 500));
  if (!set.length) return res.status(400).json({ error: 'Nada para atualizar' });
  vals.push(req.params.id);
  try {
    const r = await db.query(`UPDATE retirada_itens SET ${set.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, vals);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { console.error('PUT /retirada/itens/:id:', e); res.status(500).json({ error: 'Erro ao atualizar item' }); }
});

// DELETE /itens/:id
router.delete('/itens/:id', async (req, res) => {
  try {
    const r = await db.query('DELETE FROM retirada_itens WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item não encontrado' });
    res.json({ message: 'Removido' });
  } catch (e) { console.error('DELETE /retirada/itens/:id:', e); res.status(500).json({ error: 'Erro ao remover' }); }
});

// POST /reclamar — { ids:[], protocolo } → grava o protocolo nos selecionados e agrupa
router.post('/reclamar', async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  const protocolo = s(req.body.protocolo, 40).trim();
  if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos um item' });
  if (!protocolo) return res.status(400).json({ error: 'Informe o número do protocolo' });
  try {
    const r = await db.query(
      `UPDATE retirada_itens SET protocolo = $1, status = 'em_acompanhamento', updated_at = NOW()
       WHERE id = ANY($2) AND (protocolo IS NULL OR protocolo = '') RETURNING *`,
      [protocolo, ids]
    );
    res.json({ atualizados: r.rowCount, itens: r.rows });
  } catch (e) { console.error('POST /retirada/reclamar:', e); res.status(500).json({ error: 'Erro ao reclamar' }); }
});

// POST /itens/status — muda o status de itens selecionados (resolver 4 de 6, por ex.)
router.post('/itens/status', async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  const status = s(req.body.status, 20);
  const ok = ['em_acompanhamento', 'resolvido', 'nao_resolvido'];
  if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos um item' });
  if (!ok.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  try {
    const r = await db.query(
      `UPDATE retirada_itens SET status = $1, updated_at = NOW() WHERE id = ANY($2) AND protocolo IS NOT NULL RETURNING *`,
      [status, ids]
    );
    res.json({ atualizados: r.rowCount, itens: r.rows });
  } catch (e) { console.error('POST /retirada/itens/status:', e); res.status(500).json({ error: 'Erro ao atualizar status' }); }
});

// PUT /protocolos/:protocolo — muda o status de TODOS os itens do bloco de uma vez
router.put('/protocolos/:protocolo', async (req, res) => {
  const status = s(req.body.status, 20);
  const ok = ['em_acompanhamento', 'resolvido', 'nao_resolvido'];
  if (!ok.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  try {
    const r = await db.query(
      'UPDATE retirada_itens SET status = $1, updated_at = NOW() WHERE protocolo = $2 RETURNING *',
      [status, req.params.protocolo]
    );
    res.json({ atualizados: r.rowCount, itens: r.rows });
  } catch (e) { console.error('PUT /retirada/protocolos:', e); res.status(500).json({ error: 'Erro ao atualizar bloco' }); }
});

// POST /protocolos/:protocolo/reabrir — devolve os itens para "a reclamar" (sem protocolo)
router.post('/protocolos/:protocolo/reabrir', async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE retirada_itens SET protocolo = NULL, status = 'pendente', updated_at = NOW() WHERE protocolo = $1 RETURNING *`,
      [req.params.protocolo]
    );
    res.json({ atualizados: r.rowCount, itens: r.rows });
  } catch (e) { console.error('POST /retirada/protocolos/reabrir:', e); res.status(500).json({ error: 'Erro ao reabrir' }); }
});

// ---- Opções (motivos / justificativas) ----
router.post('/opcoes', async (req, res) => {
  const tipo = s(req.body.tipo, 20);
  const texto = s(req.body.texto, 500).trim();
  if (tipo !== 'motivo' && tipo !== 'justificativa') return res.status(400).json({ error: 'Tipo inválido' });
  if (!texto) return res.status(400).json({ error: 'Informe o texto' });
  try {
    const r = await db.query('INSERT INTO retirada_opcoes (tipo, texto) VALUES ($1,$2) RETURNING id, tipo, texto', [tipo, texto]);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('POST /retirada/opcoes:', e); res.status(500).json({ error: 'Erro ao adicionar opção' }); }
});
router.put('/opcoes/:id', async (req, res) => {
  const texto = s(req.body.texto, 500).trim();
  if (!texto) return res.status(400).json({ error: 'Informe o texto' });
  try {
    const r = await db.query('UPDATE retirada_opcoes SET texto = $1 WHERE id = $2 RETURNING id, tipo, texto', [texto, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Opção não encontrada' });
    res.json(r.rows[0]);
  } catch (e) { console.error('PUT /retirada/opcoes/:id:', e); res.status(500).json({ error: 'Erro ao editar opção' }); }
});
router.delete('/opcoes/:id', async (req, res) => {
  try {
    const r = await db.query('DELETE FROM retirada_opcoes WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Opção não encontrada' });
    res.json({ message: 'Removida' });
  } catch (e) { console.error('DELETE /retirada/opcoes/:id:', e); res.status(500).json({ error: 'Erro ao remover opção' }); }
});

module.exports = router;
