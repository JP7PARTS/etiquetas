// Reclamações / Reputação — casos de vendas que afetam a reputação e precisam ser
// contestadas no Mercado Livre. Um caso por "# da venda" (numero_venda), que acumula
// tentativas (IA/Humano) com protocolo e nota. A planilha "Vendas com problemas" do ML
// é importada e faz UPSERT: cria os novos, atualiza os dados do ML e preserva as
// anotações do usuário. Vendas que somem da planilha nova são marcadas ativo=false
// ("saíram da lista"). Só admin.
const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

let ready = null;
const ensureTable = () => {
  if (!ready) ready = db.query(`CREATE TABLE IF NOT EXISTS reputation_cases (
    id SERIAL PRIMARY KEY,
    numero_venda VARCHAR(40) UNIQUE NOT NULL,
    data_venda VARCHAR(60),
    titulo TEXT,
    tipo_problema VARCHAR(160),
    detalhe_problema VARCHAR(200),
    exclusao TEXT,
    status VARCHAR(30) DEFAULT 'a_analisar',
    aguardar_ate DATE,
    analise TEXT,
    argumento TEXT,
    tentativas JSONB NOT NULL DEFAULT '[]'::jsonb,
    ativo BOOLEAN DEFAULT TRUE,
    created_by_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`).catch(e => { ready = null; throw e; });
  return ready;
};
router.use(async (req, res, next) => { try { await ensureTable(); next(); } catch (e) { console.error('ensure reputation_cases:', e); res.status(500).json({ error: 'Erro ao preparar tabela' }); } });

const STATUS = ['a_analisar', 'reclamada', 'aguardar', 'resolvida', 'recusada'];
const s = (v, n) => (v == null ? '' : String(v)).slice(0, n);

// POST /importar — { items: [{ numero_venda, data_venda, titulo, tipo_problema, detalhe_problema, exclusao }] }
router.post('/importar', async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : null;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Nenhuma venda na planilha' });
  const nome = req.user.username || req.user.email;
  const vistos = [];
  let novos = 0, atualizados = 0;
  try {
    for (const it of items) {
      const numero = s(it.numero_venda, 40).trim();
      if (!numero) continue;
      vistos.push(numero);
      const r = await db.query(
        `INSERT INTO reputation_cases (numero_venda, data_venda, titulo, tipo_problema, detalhe_problema, exclusao, ativo, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
         ON CONFLICT (numero_venda) DO UPDATE SET
           data_venda = EXCLUDED.data_venda,
           titulo = EXCLUDED.titulo,
           tipo_problema = EXCLUDED.tipo_problema,
           detalhe_problema = EXCLUDED.detalhe_problema,
           exclusao = EXCLUDED.exclusao,
           ativo = TRUE,
           updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [numero, s(it.data_venda, 60), s(it.titulo, 500), s(it.tipo_problema, 160), s(it.detalhe_problema, 200), s(it.exclusao, 300), nome]
      );
      if (r.rows[0] && r.rows[0].inserted) novos++; else atualizados++;
    }
    // Marca como inativas (saíram da lista) as que não vieram nesta planilha
    let sairam = 0;
    if (vistos.length) {
      const del = await db.query(
        `UPDATE reputation_cases SET ativo = FALSE, updated_at = NOW()
         WHERE ativo = TRUE AND NOT (numero_venda = ANY($1)) RETURNING id`,
        [vistos]
      );
      sairam = del.rowCount;
    }
    res.json({ total: vistos.length, novos, atualizados, sairam });
  } catch (err) {
    console.error('POST /reputacao/importar error:', err);
    res.status(500).json({ error: 'Erro ao importar planilha' });
  }
});

// GET / — todos os casos (o front separa ativos de "saíram da lista")
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM reputation_cases ORDER BY ativo DESC, updated_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /reputacao error:', err);
    res.status(500).json({ error: 'Erro ao buscar casos' });
  }
});

// PUT /:numero — atualiza campos de trabalho { status, aguardar_ate, analise, argumento }
router.put('/:numero', async (req, res) => {
  const numero = s(req.params.numero, 40).trim();
  const status = req.body.status != null ? s(req.body.status, 30) : null;
  if (status && !STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  const aguardar = req.body.aguardar_ate !== undefined ? (req.body.aguardar_ate || null) : undefined;
  const analise = req.body.analise !== undefined ? String(req.body.analise) : undefined;
  const argumento = req.body.argumento !== undefined ? String(req.body.argumento) : undefined;
  try {
    const result = await db.query(
      `UPDATE reputation_cases SET
         status = COALESCE($2, status),
         aguardar_ate = CASE WHEN $3::boolean THEN $4::date ELSE aguardar_ate END,
         analise = COALESCE($5, analise),
         argumento = COALESCE($6, argumento),
         updated_at = NOW()
       WHERE numero_venda = $1 RETURNING *`,
      [numero, status, aguardar !== undefined, aguardar || null, analise ?? null, argumento ?? null]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Caso não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /reputacao/:numero error:', err);
    res.status(500).json({ error: 'Erro ao atualizar caso' });
  }
});

// POST /:numero/tentativas — adiciona uma tentativa { canal, protocolo, nota }
router.post('/:numero/tentativas', async (req, res) => {
  const numero = s(req.params.numero, 40).trim();
  const canal = s(req.body.canal, 10).toLowerCase() === 'humano' ? 'humano' : 'ia';
  const protocolo = s(req.body.protocolo, 40).trim();
  const nota = req.body.nota != null ? String(req.body.nota) : '';
  try {
    const cur = await db.query('SELECT tentativas FROM reputation_cases WHERE numero_venda = $1', [numero]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Caso não encontrado' });
    const tentativas = Array.isArray(cur.rows[0].tentativas) ? cur.rows[0].tentativas : [];
    const nova = {
      id: Date.now(), data: new Date().toISOString(), canal, protocolo, nota,
      autor: req.user.username || req.user.email,
    };
    tentativas.push(nova);
    // Ao reclamar, se ainda estava "a analisar", passa para "reclamada" (aguardando resposta)
    const r = await db.query(
      `UPDATE reputation_cases SET tentativas = $2::jsonb,
         status = CASE WHEN status = 'a_analisar' THEN 'reclamada' ELSE status END,
         updated_at = NOW()
       WHERE numero_venda = $1 RETURNING *`,
      [numero, JSON.stringify(tentativas)]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('POST /reputacao/:numero/tentativas error:', err);
    res.status(500).json({ error: 'Erro ao salvar tentativa' });
  }
});

// DELETE /:numero/tentativas/:tid — remove uma tentativa
router.delete('/:numero/tentativas/:tid', async (req, res) => {
  const numero = s(req.params.numero, 40).trim();
  const tid = Number(req.params.tid);
  try {
    const cur = await db.query('SELECT tentativas FROM reputation_cases WHERE numero_venda = $1', [numero]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Caso não encontrado' });
    const tentativas = (Array.isArray(cur.rows[0].tentativas) ? cur.rows[0].tentativas : []).filter(t => t.id !== tid);
    const r = await db.query(
      'UPDATE reputation_cases SET tentativas = $2::jsonb, updated_at = NOW() WHERE numero_venda = $1 RETURNING *',
      [numero, JSON.stringify(tentativas)]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('DELETE /reputacao/:numero/tentativas/:tid error:', err);
    res.status(500).json({ error: 'Erro ao remover tentativa' });
  }
});

// DELETE /:numero — remove o caso
router.delete('/:numero', async (req, res) => {
  const numero = s(req.params.numero, 40).trim();
  try {
    const r = await db.query('DELETE FROM reputation_cases WHERE numero_venda = $1 RETURNING id', [numero]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Caso não encontrado' });
    res.json({ message: 'Caso removido' });
  } catch (err) {
    console.error('DELETE /reputacao/:numero error:', err);
    res.status(500).json({ error: 'Erro ao remover caso' });
  }
});

module.exports = router;
