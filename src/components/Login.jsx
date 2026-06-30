import React, { useState } from 'react';
import api from '../utils/api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      onLogin(res.data.user, res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#0077b6"/>
            <rect x="8" y="14" width="32" height="20" rx="3" fill="#fff" opacity="0.15"/>
            <rect x="10" y="16" width="28" height="16" rx="2" fill="#fff" opacity="0.2"/>
            <rect x="12" y="19" width="12" height="2" rx="1" fill="#fff"/>
            <rect x="12" y="23" width="18" height="6" rx="1" fill="#fff" opacity="0.8"/>
            <rect x="12" y="23" width="2" height="6" fill="#fff"/>
            <rect x="15" y="23" width="2" height="6" fill="#fff"/>
            <rect x="18" y="23" width="1" height="6" fill="#fff"/>
            <rect x="20" y="23" width="2" height="6" fill="#fff"/>
            <rect x="23" y="23" width="2" height="6" fill="#fff"/>
            <rect x="26" y="23" width="1" height="6" fill="#fff"/>
            <rect x="28" y="23" width="2" height="6" fill="#fff"/>
          </svg>
        </div>
        <h1 style={styles.title}>Gerador de Etiquetas ZPL</h1>
        <p style={styles.subtitle}>Zebra GC420T — 40×25mm</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
            disabled={loading}
          >
            {loading ? <><span className="spinner" style={{width:16,height:16,borderWidth:2}} /> Entrando...</> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    padding: '20px',
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    padding: '40px 36px',
    width: '100%',
    maxWidth: '380px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  logo: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    textAlign: 'center',
    color: '#1a202c',
    marginBottom: '4px',
  },
  subtitle: {
    textAlign: 'center',
    color: '#718096',
    fontSize: '13px',
    marginBottom: '28px',
  },
  form: {},
};
