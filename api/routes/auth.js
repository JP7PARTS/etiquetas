const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT id, email, role, created_at FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json(user);
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/change-password  — usuário logado troca a própria senha
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Senha atual e nova são obrigatórias' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'A nova senha deve ter ao menos 4 caracteres' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
