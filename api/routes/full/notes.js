// Módulo Envio Full — anotações persistentes por Código ML. Isolado, só admin.
const express = require('express');
const db = require('../../db');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

// GET / — todas as anotações (mapa codigo_ml -> note)
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT codigo_ml, note, updated_at FROM full_notes');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /full/notes error:', err);
    res.status(500).json({ error: 'Erro ao buscar anotações' });
  }
});

// PUT /:codigo_ml — cria/atualiza (nota vazia remove)
router.put('/:codigo_ml', async (req, res) => {
  const codigo = String(req.params.codigo_ml || '').trim();
  const note = typeof req.body.note === 'string' ? req.body.note : '';
  if (!codigo) return res.status(400).json({ error: 'Código ML é obrigatório' });
  try {
    if (!note.trim()) {
      await db.query('DELETE FROM full_notes WHERE codigo_ml = $1', [codigo]);
      return res.json({ message: 'Anotação removida' });
    }
    await db.query(
      `INSERT INTO full_notes (codigo_ml, note, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (codigo_ml) DO UPDATE SET note = $2, updated_at = NOW()`,
      [codigo, note]
    );
    res.json({ message: 'Anotação salva' });
  } catch (err) {
    console.error('PUT /full/notes/:codigo_ml error:', err);
    res.status(500).json({ error: 'Erro ao salvar anotação' });
  }
});

module.exports = router;
