import React, { useState, useEffect } from 'react';
import api from '../utils/api.js';

const emptyForm = { email: '', password: '', role: 'user' };

export default function UserManagement({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState(null); // null | 'create' | 'edit'
  const [form, setForm] = useState(emptyForm);
  const [editUser, setEditUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      setError('Erro ao carregar usuários: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  function showMessage(msg, type = 'success') {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 3500);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditUser(null);
    setModal('create');
  }

  function openEdit(u) {
    setForm({ email: u.email, password: '', role: u.role });
    setEditUser(u);
    setModal('edit');
  }

  function closeModal() {
    setModal(null);
    setForm(emptyForm);
    setEditUser(null);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'edit' && editUser) {
        const payload = { role: form.role };
        if (form.password.trim()) payload.password = form.password;
        await api.put(`/users/${editUser.id}`, payload);
        showMessage('Usuário atualizado com sucesso!');
      } else {
        await api.post('/users', form);
        showMessage('Usuário criado com sucesso!');
      }
      closeModal();
      loadUsers();
    } catch (err) {
      showMessage(err.response?.data?.error || 'Erro ao salvar usuário', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setDeleting(true);
    try {
      await api.delete(`/users/${id}`);
      showMessage('Usuário excluído com sucesso!');
      setDeleteConfirm(null);
      loadUsers();
    } catch (err) {
      showMessage(err.response?.data?.error || 'Erro ao excluir usuário', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Usuários</h1>
        <p>Crie e gerencie quem pode acessar o sistema</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <div style={styles.toolbar}>
          <div style={{ flex: 1 }} />
          <button className="btn-primary" onClick={openCreate}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novo usuário
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>Carregando...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state"><p>Nenhum usuário cadastrado</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Usuário / E-mail</th>
                  <th>Papel</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      {u.email}
                      {u.id === user?.id && <span style={styles.youTag}>você</span>}
                    </td>
                    <td>
                      <span className={`badge badge-${u.role}`}>{u.role}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button className="btn-outline" style={{ padding: '5px 10px' }} onClick={() => openEdit(u)}>
                          Editar
                        </button>
                        {u.id !== user?.id && (
                          <button className="btn-danger" style={{ padding: '5px 10px' }} onClick={() => setDeleteConfirm(u)}>
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modal && (
        <div style={styles.modalOverlay} onClick={e => e.target === e.currentTarget && closeModal()}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{modal === 'edit' ? 'Editar usuário' : 'Novo usuário'}</h2>
              <button style={styles.closeBtn} onClick={closeModal}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave} style={styles.modalBody}>
              <div className="form-group">
                <label htmlFor="u-email">Usuário ou e-mail *</label>
                <input
                  id="u-email" name="email" value={form.email} onChange={handleChange}
                  placeholder="operador" maxLength={255} required
                  disabled={modal === 'edit'}
                  style={modal === 'edit' ? { background: '#f7fafc' } : {}}
                />
                {modal === 'edit' && (
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    O login não pode ser alterado após a criação
                  </div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="u-pass">{modal === 'edit' ? 'Nova senha' : 'Senha *'}</label>
                <input
                  id="u-pass" name="password" type="text" value={form.password} onChange={handleChange}
                  placeholder={modal === 'edit' ? 'Deixe em branco para manter' : 'mínimo 4 caracteres'}
                  maxLength={100} required={modal === 'create'}
                />
              </div>
              <div className="form-group">
                <label htmlFor="u-role">Papel</label>
                <select id="u-role" name="role" value={form.role} onChange={handleChange}
                  disabled={modal === 'edit' && editUser?.id === user?.id}>
                  <option value="user">Operador (acesso limitado)</option>
                  <option value="admin">Administrador (acesso total)</option>
                </select>
                {modal === 'edit' && editUser?.id === user?.id && (
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Você não pode alterar o próprio papel
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn-secondary" onClick={closeModal}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving
                    ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Salvando...</>
                    : modal === 'edit' ? 'Salvar alterações' : 'Criar usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div style={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div style={{ ...styles.modal, maxWidth: '420px' }}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Confirmar exclusão</h2>
              <button style={styles.closeBtn} onClick={() => setDeleteConfirm(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Tem certeza que deseja excluir o usuário{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{deleteConfirm.email}</strong>?
              </p>
              <p style={{ color: 'var(--btn-danger)', fontSize: '12.5px', marginBottom: '20px' }}>
                Esta ação não pode ser desfeita.
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                <button className="btn-danger" onClick={() => handleDelete(deleteConfirm.id)} disabled={deleting}>
                  {deleting
                    ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} /> Excluindo...</>
                    : 'Sim, excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  toolbar: { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' },
  youTag: { marginLeft: '8px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', background: '#f1f5f9', padding: '2px 7px', borderRadius: '9px' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  modal: { background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' },
  modalTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' },
  closeBtn: { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' },
  modalBody: { padding: '22px' },
};
