import React, { useState } from 'react';
import api from '../utils/api.js';

export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (next.length < 4) { setError('A nova senha deve ter ao menos 4 caracteres'); return; }
    if (next !== confirm) { setError('A confirmação não confere com a nova senha'); return; }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao trocar a senha');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Trocar senha</h2>
          <button style={styles.close} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} style={styles.body}>
          {error && <div className="alert alert-error" style={{ marginBottom: '14px' }}>{error}</div>}
          {done ? (
            <div className="alert alert-success">✅ Senha alterada com sucesso!</div>
          ) : (
            <>
              <div className="form-group">
                <label>Senha atual</label>
                <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required autoComplete="current-password" />
              </div>
              <div className="form-group">
                <label>Nova senha</label>
                <input type="password" value={next} onChange={e => setNext(e.target.value)} required autoComplete="new-password" placeholder="mínimo 4 caracteres" />
              </div>
              <div className="form-group">
                <label>Confirmar nova senha</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving
                    ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Salvando...</>
                    : 'Trocar senha'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  modal: { background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' },
  title: { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' },
  close: { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' },
  body: { padding: '22px' },
};
