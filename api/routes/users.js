const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Todas as rotas exigem admin
router.use(authenticate, requireAdmin);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, role, created_at FROM users ORDER BY email ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Usuário/e-mail é obrigatório' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Papel inválido' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at',
      [email.toLowerCase().trim(), hash, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Usuário já existe' });
    }
    console.error('POST /users error:', err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// PUT /api/users/:id  — atualiza papel e, opcionalmente, reseta senha
router.put('/:id', async (req, res) => {
  const { role, password } = req.body;
  const id = Number(req.params.id);

  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Papel inválido' });
  }
  // Impede o admin de rebaixar o próprio papel (evita auto-lockout)
  if (id === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: 'Você não pode alterar o próprio papel' });
  }
  if (password && password.length < 4) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });
  }

  try {
    let result;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      result = await db.query(
        'UPDATE users SET role = $1, password_hash = $2 WHERE id = $3 RETURNING id, email, role, created_at',
        [role, hash, id]
      );
    } else {
      result = await db.query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, created_at',
        [role, id]
      );
    }
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /users/:id error:', err);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Você não pode excluir o próprio usuário' });
  }
  try {
    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (err) {
    console.error('DELETE /users/:id error:', err);
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});

module.exports = router;
