import React, { useState, useEffect } from 'react';
import api from '../utils/api.js';

function getTheme() {
  try { return document.documentElement.getAttribute('data-theme') || 'light'; } catch { return 'light'; }
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(getTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* modo privado */ }
  }, [theme]);

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
      <button
        type="button"
        onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        style={styles.themeToggle}
        title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        aria-label="Alternar tema"
      >
        {theme === 'dark' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8Z" />
          </svg>
        )}
      </button>
      <div style={styles.card}>
        <div style={styles.logo}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#047857"/>
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
            <label htmlFor="email">Usuário ou e-mail</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="operador ou seu@email.com"
              autoComplete="username"
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
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(140deg, #0f172a 0%, #1e293b 55%, #334155 100%)',
    padding: '20px',
  },
  themeToggle: {
    position: 'absolute',
    top: '18px',
    right: '18px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    cursor: 'pointer',
  },
  card: {
    background: 'var(--color-card)',
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
    color: 'var(--color-foreground)',
    marginBottom: '4px',
  },
  subtitle: {
    textAlign: 'center',
    color: 'var(--color-subtle)',
    fontSize: '13px',
    marginBottom: '28px',
  },
  form: {},
};
