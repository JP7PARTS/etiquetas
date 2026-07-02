import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import { copyZPL } from '../utils/zpl.js';

const emptyForm = { nome: '', zpl: '' };

// Deslocamento vertical aplicado na impressão para descer as linhas (dots @ 8 dpmm).
const PRINT_OFFSET_Y = 25;

// Aplica a quantidade desejada ao comando ^PQ do ZPL (mantém params extras).
function applyQuantity(zpl, qty) {
  const q = Math.max(1, Math.min(parseInt(qty, 10) || 1, 9999));
  if (/\^PQ\d+/i.test(zpl)) {
    return zpl.replace(/(\^PQ)\d+/i, `$1${q}`);
  }
  if (/\^XZ/i.test(zpl)) {
    return zpl.replace(/\^XZ/i, `^PQ${q}\n^XZ`);
  }
  return zpl;
}

// Desce todas as linhas somando dy ao Y do ^LH (label home). Insere ^LH se não houver.
function applyPrintOffset(zpl, dy) {
  if (!dy) return zpl;
  if (/\^LH\d+,\d+/i.test(zpl)) {
    return zpl.replace(/(\^LH\d+,)(\d+)/i, (m, p, y) => `${p}${parseInt(y, 10) + dy}`);
  }
  if (/\^XA/i.test(zpl)) {
    return zpl.replace(/\^XA/i, `^XA\n^LH0,${dy}`);
  }
  return zpl;
}

export default function WarningLabels({ user }) {
  const isAdmin = user?.role === 'admin';
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [quantities, setQuantities] = useState({}); // { [id]: qty }

  useEffect(() => {
    loadList();
  }, []);

  async function loadList(q = '') {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/warnings', { params: q ? { search: q } : {} });
      setList(res.data);
    } catch (err) {
      setError('Erro ao carregar etiquetas de aviso: ' + (err.response?.data?.error || err.message));
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
    if (!isAdmin) return;
    setForm(emptyForm);
    setEditId(null);
    setMode('create');
  }

  function openEdit(item) {
    if (!isAdmin) return;
    setForm({ nome: item.nome, zpl: item.zpl });
    setEditId(item.id);
    setMode('edit');
  }

  function cancelEdit() {
    setMode('list');
    setForm(emptyForm);
    setEditId(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.nome.trim() || !form.zpl.trim()) return;
    setSaving(true);
    try {
      if (mode === 'edit' && editId) {
        await api.put(`/warnings/${editId}`, form);
        showMessage('Etiqueta de aviso atualizada com sucesso!');
      } else {
        await api.post('/warnings', form);
        showMessage('Etiqueta de aviso criada com sucesso!');
      }
      cancelEdit();
      loadList(search);
    } catch (err) {
      showMessage(err.response?.data?.error || 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setDeleting(true);
    try {
      await api.delete(`/warnings/${id}`);
      showMessage('Etiqueta de aviso excluída com sucesso!');
      setDeleteConfirm(null);
      loadList(search);
    } catch (err) {
      showMessage(err.response?.data?.error || 'Erro ao excluir', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function handleSearch(e) {
    setSearch(e.target.value);
    loadList(e.target.value);
  }

  async function handleCopy(item) {
    const qty = Math.max(1, Math.min(parseInt(quantities[item.id], 10) || 1, 9999));
    try {
      await copyZPL(applyPrintOffset(applyQuantity(item.zpl, qty), PRINT_OFFSET_Y));
      showMessage(`ZPL de "${item.nome}" (${qty} ${qty === 1 ? 'etiqueta' : 'etiquetas'}) copiado!`);
    } catch {
      showMessage('Não foi possível copiar o ZPL', 'error');
    }
  }

  // ---------- EDITOR MODE ----------
  if (mode === 'create' || mode === 'edit') {
    return (
      <div>
        <div className="page-header">
          <h1>{mode === 'edit' ? 'Editar Etiqueta de Aviso' : 'Nova Etiqueta de Aviso'}</h1>
          <p>Cole o ZPL e acompanhe o preview ao lado (etiqueta 40×25mm)</p>
        </div>

        {error && <div className="alert alert-error" style={{marginBottom:'16px'}}>{error}</div>}

        <form onSubmit={handleSave}>
          <div style={styles.editorGrid}>
            {/* Coluna esquerda: nome + zpl */}
            <div className="card">
              <div className="form-group">
                <label htmlFor="wl-nome">Nome do aviso *</label>
                <input
                  id="wl-nome"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Encaixe aplique azul claro"
                  maxLength={150}
                  required
                />
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label htmlFor="wl-zpl">Código ZPL *</label>
                <textarea
                  id="wl-zpl"
                  value={form.zpl}
                  onChange={e => setForm(f => ({ ...f, zpl: e.target.value }))}
                  placeholder="^XA&#10;...&#10;^XZ"
                  rows={18}
                  spellCheck={false}
                  style={styles.zplTextarea}
                  required
                />
              </div>
            </div>

            {/* Coluna direita: preview */}
            <div className="card">
              <h3 style={styles.previewTitle}>Preview da etiqueta</h3>
              <ZplPreview zpl={form.zpl} />
              <p style={styles.previewHint}>
                Renderizado via Labelary (8 dpmm · 40×25mm). Precisa de internet.
              </p>
            </div>
          </div>

          <div style={styles.editorActions}>
            <button type="button" className="btn-secondary" onClick={cancelEdit}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={!form.nome.trim() || !form.zpl.trim() || saving}>
              {saving
                ? <><span className="spinner" style={{width:13,height:13,borderWidth:2}} /> Salvando...</>
                : mode === 'edit' ? 'Salvar Alterações' : 'Criar Aviso'
              }
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ---------- LIST MODE ----------
  return (
    <div>
      <div className="page-header">
        <h1>Etiquetas de Aviso</h1>
        <p>Biblioteca de avisos prontos para reimprimir</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <div style={styles.toolbar}>
          <div style={styles.searchWrapper}>
            <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={handleSearch}
              placeholder="Buscar aviso pelo nome..."
              style={{paddingLeft: '34px'}}
            />
          </div>
          {isAdmin && (
            <button className="btn-primary" onClick={openCreate}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Novo aviso
            </button>
          )}
        </div>

        {loading ? (
          <div style={{padding:'40px', textAlign:'center'}}>
            <div className="spinner" style={{margin:'0 auto'}} />
            <p style={{marginTop:'12px',color:'var(--text-muted)'}}>Carregando...</p>
          </div>
        ) : list.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e0" strokeWidth="1.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p>{search ? `Nenhum aviso encontrado para "${search}"` : 'Nenhuma etiqueta de aviso cadastrada'}</p>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th style={{textAlign:'right'}}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map(item => (
                  <tr key={item.id}>
                    <td style={{fontWeight:500, color:'var(--text-primary)'}}>{item.nome}</td>
                    <td>
                      <div style={{display:'flex', gap:'6px', justifyContent:'flex-end', alignItems:'center', flexWrap:'wrap'}}>
                        <div style={styles.qtyWrapper}>
                          <label style={styles.qtyLabel}>Qtde</label>
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            value={quantities[item.id] ?? 1}
                            onChange={e => {
                              const v = e.target.value;
                              setQuantities(q => ({ ...q, [item.id]: v === '' ? '' : Math.max(1, Math.min(parseInt(v, 10) || 1, 9999)) }));
                            }}
                            onBlur={e => { if (!e.target.value) setQuantities(q => ({ ...q, [item.id]: 1 })); }}
                            style={styles.qtyInput}
                          />
                        </div>
                        <button className="btn-success" style={{padding:'5px 12px'}} onClick={() => handleCopy(item)}>
                          Copiar
                        </button>
                        {isAdmin && (
                          <>
                            <button className="btn-outline" style={{padding:'5px 10px'}} onClick={() => openEdit(item)}>
                              Editar
                            </button>
                            <button className="btn-danger" style={{padding:'5px 10px'}} onClick={() => setDeleteConfirm(item)}>
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={styles.tableFooter}>
              {list.length} aviso{list.length !== 1 ? 's' : ''} {search ? 'encontrado' : 'cadastrado'}{list.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div style={{...styles.modal, maxWidth:'420px'}}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Confirmar Exclusão</h2>
              <button style={styles.closeBtn} onClick={() => setDeleteConfirm(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div style={styles.modalBody}>
              <p style={{color:'var(--text-secondary)', marginBottom:'16px'}}>
                Tem certeza que deseja excluir o aviso{' '}
                <strong style={{color:'var(--text-primary)'}}>{deleteConfirm.nome}</strong>?
              </p>
              <p style={{color:'var(--btn-danger)', fontSize:'12.5px', marginBottom:'20px'}}>
                Esta ação não pode ser desfeita.
              </p>
              <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
                <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>
                  Cancelar
                </button>
                <button className="btn-danger" onClick={() => handleDelete(deleteConfirm.id)} disabled={deleting}>
                  {deleting
                    ? <><span className="spinner" style={{width:13,height:13,borderWidth:2,borderTopColor:'#fff',borderColor:'rgba(255,255,255,0.3)'}} /> Excluindo...</>
                    : 'Sim, excluir'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Preview via Labelary Image API (40x25mm = 1.5748x0.9843 pol, 8 dpmm)
function ZplPreview({ zpl }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error
  const [errorMsg, setErrorMsg] = useState('');
  const urlRef = useRef(null);

  useEffect(() => {
    const trimmed = (zpl || '').trim();
    if (!trimmed) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          'https://api.labelary.com/v1/printers/8dpmm/labels/1.5748x0.9843/0/',
          {
            method: 'POST',
            headers: {
              'Accept': 'image/png',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: trimmed,
            signal: controller.signal,
          }
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          setStatus('error');
          setErrorMsg(text || `Erro ${res.status} ao renderizar`);
          return;
        }
        const blob = await res.blob();
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setImgUrl(url);
        setStatus('ok');
      } catch (err) {
        if (err.name === 'AbortError') return;
        setStatus('error');
        setErrorMsg('Não foi possível conectar ao Labelary (verifique a internet).');
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [zpl]);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  return (
    <div style={styles.previewBox}>
      {status === 'idle' && (
        <span style={styles.previewPlaceholder}>Cole o ZPL para ver o preview</span>
      )}
      {status === 'loading' && (
        <div style={{textAlign:'center'}}>
          <div className="spinner" style={{margin:'0 auto'}} />
          <p style={{marginTop:'10px', color:'var(--text-muted)', fontSize:'12px'}}>Renderizando...</p>
        </div>
      )}
      {status === 'ok' && imgUrl && (
        <img src={imgUrl} alt="Preview da etiqueta" style={styles.previewImg} />
      )}
      {status === 'error' && (
        <div style={styles.previewError}>
          <strong>ZPL inválido ou erro no preview:</strong>
          <pre style={styles.previewErrorText}>{errorMsg}</pre>
        </div>
      )}
    </div>
  );
}

const styles = {
  toolbar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    flex: 1,
    minWidth: '200px',
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
    pointerEvents: 'none',
  },
  tableFooter: {
    padding: '10px 14px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    borderTop: '1px solid var(--border)',
  },
  qtyWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginRight: '2px',
  },
  qtyLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontWeight: '600',
  },
  qtyInput: {
    width: '64px',
    padding: '5px 6px',
    textAlign: 'center',
  },
  editorGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    alignItems: 'start',
  },
  zplTextarea: {
    fontFamily: "'Courier New', monospace",
    fontSize: '12.5px',
    lineHeight: 1.5,
    resize: 'vertical',
    whiteSpace: 'pre',
    overflowWrap: 'normal',
    overflowX: 'auto',
  },
  previewTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: '0 0 12px 0',
  },
  previewBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '220px',
    background: '#f7fafc',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '16px',
  },
  previewImg: {
    maxWidth: '100%',
    maxHeight: '320px',
    border: '1px solid #cbd5e0',
    background: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  previewPlaceholder: {
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  previewError: {
    color: 'var(--btn-danger)',
    fontSize: '12.5px',
    width: '100%',
  },
  previewErrorText: {
    marginTop: '8px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '11.5px',
    fontFamily: "'Courier New', monospace",
    background: '#fff5f5',
    padding: '8px',
    borderRadius: '4px',
  },
  previewHint: {
    marginTop: '10px',
    fontSize: '11.5px',
    color: 'var(--text-muted)',
  },
  editorActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '20px',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  modal: {
    background: '#fff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '520px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 22px',
    borderBottom: '1px solid var(--border)',
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    borderRadius: '4px',
  },
  modalBody: {
    padding: '22px',
  },
};
