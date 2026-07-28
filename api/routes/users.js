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
      'SELECT id, username, email, role, created_at FROM users ORDER BY username ASC NULLS LAST, email ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Usuário é obrigatório' });
  }
  if (email && email.trim() && !email.includes('@')) {
    return res.status(400).json({ error: 'E-mail inválido' });
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
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
      [username.toLowerCase().trim(), email && email.trim() ? email.toLowerCase().trim() : null, hash, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Usuário ou e-mail já existe' });
    }
    console.error('POST /users error:', err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// PUT /api/users/:id  — atualiza papel e, opcionalmente, reseta senha
router.put('/:id', async (req, res) => {
  const { role, password, email, username } = req.body;
  const id = Number(req.params.id);

  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Papel inválido' });
  }
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Usuário é obrigatório' });
  }
  // Impede o admin de rebaixar o próprio papel (evita auto-lockout)
  if (id === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: 'Você não pode alterar o próprio papel' });
  }
  if (password && password.length < 4) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });
  }
  if (email && email.trim() && !email.includes('@')) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }
  const emailVal = email !== undefined ? (email && email.trim() ? email.toLowerCase().trim() : null) : undefined;

  try {
    const sets = ['role = $1', 'email = $2', 'username = $3'];
    const params = [role, emailVal ?? null, username.toLowerCase().trim()];
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push(`password_hash = $${params.length + 1}`);
      params.push(hash);
    }
    params.push(id);
    const result = await db.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, username, email, role, created_at`,
      params
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Usuário ou e-mail já está em uso' });
    }
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
