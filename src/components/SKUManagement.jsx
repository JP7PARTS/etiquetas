import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import { backdropHandlers } from '../utils/backdrop.js';

const emptyForm = { sku: '', descricao_longa: '', descricao_curta: '', descricao_curta_2: '', local: '', comprimento_cm: '', largura_cm: '', altura_cm: '', peso_kg: '', tipo_envio: '', embalagem_id: '', shopee_comprimento_cm: '', shopee_largura_cm: '', shopee_altura_cm: '', papelao_full_cm: '', papelao_shopee_cm: '' };

// Rótulo do tipo de envio para a coluna Medidas
const TIPO_ENVIO_LABEL = {
  propria: { txt: '📦 Emb. própria', color: '#2b6cb0', bg: '#ebf8ff' },
  sem: { txt: '⚠️ Sem embalagem', color: '#c05621', bg: '#fffaf0' },
  padrao: { txt: '📦', color: '#276749', bg: '#f0fff4' }, // nome da embalagem entra ao lado
  papelao: { txt: '📦 Papelão', color: '#744210', bg: '#fefcbf' },
};

// Peso volumétrico (kg) = C×L×A(cm) / 6000 (divisor padrão ML/Correios). Só com as 3 medidas.
function pesoVolumetrico(c, l, a) {
  const nc = parseFloat(String(c).replace(',', '.')), nl = parseFloat(String(l).replace(',', '.')), na = parseFloat(String(a).replace(',', '.'));
  if (!(nc > 0) || !(nl > 0) || !(na > 0)) return null;
  return (nc * nl * na) / 6000;
}

export default function SKUManagement() {
  const backdropDown = useRef(false);
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [localFilter, setLocalFilter] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState(null); // null | 'create' | 'edit'
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState(null);
  const [importErr, setImportErr] = useState('');
  const [importing, setImporting] = useState(false);
  const [embalagens, setEmbalagens] = useState([]);

  useEffect(() => {
    loadSKUs();
    api.get('/embalagens').then(r => setEmbalagens(r.data || [])).catch(() => {});
  }, []);

  const embMap = React.useMemo(() => { const m = {}; embalagens.forEach(e => { m[e.id] = e; }); return m; }, [embalagens]);

  // ---- Importação de planilha CSV ----
  function parseCSV(text) {
    const clean = text.replace(/^﻿/, ''); // remove BOM
    const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return { rows: [], error: 'A planilha precisa de um cabeçalho e ao menos uma linha.' };
    const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    const splitLine = l => l.split(sep).map(c => c.trim().replace(/^"(.*)"$/, '$1'));
    const header = splitLine(lines[0]).map(h => h.toLowerCase());
    const idx = name => header.indexOf(name);
    const iSku = idx('sku');
    if (iSku === -1) return { rows: [], error: 'A planilha precisa de uma coluna "sku".' };
    const iL = idx('descricao_longa'), iC = idx('descricao_curta'), iC2 = idx('descricao_curta_2'), iLoc = idx('local');
    const iComp = idx('comprimento_cm'), iLarg = idx('largura_cm'), iAlt = idx('altura_cm'), iPeso = idx('peso_kg'), iTipo = idx('tipo_envio');
    const iSC = idx('shopee_comprimento_cm'), iSL = idx('shopee_largura_cm'), iSA = idx('shopee_altura_cm'), iPF = idx('papelao_full_cm'), iPS = idx('papelao_shopee_cm');
    const rows = [];
    for (let n = 1; n < lines.length; n++) {
      const c = splitLine(lines[n]);
      const sku = (c[iSku] || '').trim();
      if (!sku) continue;
      rows.push({
        sku: sku.toUpperCase(),
        descricao_longa: iL > -1 ? c[iL] || '' : '',
        descricao_curta: iC > -1 ? c[iC] || '' : '',
        descricao_curta_2: iC2 > -1 ? c[iC2] || '' : '',
        local: iLoc > -1 ? c[iLoc] || '' : '',
        comprimento_cm: iComp > -1 ? c[iComp] || '' : '',
        largura_cm: iLarg > -1 ? c[iLarg] || '' : '',
        altura_cm: iAlt > -1 ? c[iAlt] || '' : '',
        peso_kg: iPeso > -1 ? c[iPeso] || '' : '',
        tipo_envio: iTipo > -1 ? (c[iTipo] || '').trim().toLowerCase() : '',
        shopee_comprimento_cm: iSC > -1 ? c[iSC] || '' : '',
        shopee_largura_cm: iSL > -1 ? c[iSL] || '' : '',
        shopee_altura_cm: iSA > -1 ? c[iSA] || '' : '',
        papelao_full_cm: iPF > -1 ? c[iPF] || '' : '',
        papelao_shopee_cm: iPS > -1 ? c[iPS] || '' : '',
      });
    }
    return { rows, error: rows.length === 0 ? 'Nenhum SKU válido encontrado na planilha.' : '' };
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    setImportErr(''); setImportRows(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const { rows, error } = parseCSV(String(ev.target.result || ''));
      if (error) { setImportErr(error); return; }
      // Classifica cada linha como novo ou edição comparando com o banco
      let existing = new Set();
      try {
        const res = await api.get('/skus');
        existing = new Set(res.data.map(s => (s.sku || '').toUpperCase()));
      } catch { /* se falhar, mostra sem classificação */ }
      setImportRows(rows.map(r => ({ ...r, isNew: existing.size ? !existing.has(r.sku.toUpperCase()) : null })));
    };
    reader.readAsText(file, 'utf-8');
  }

  async function doImport() {
    if (!importRows || importRows.length === 0) return;
    setImporting(true);
    try {
      const res = await api.post('/skus/import', { items: importRows });
      const { processados, ignorados } = res.data;
      showMessage(`Importação concluída: ${processados} processado(s)${ignorados ? `, ${ignorados} ignorado(s)` : ''}.`);
      setImportOpen(false); setImportRows(null); setImportErr('');
      loadSKUs(search);
    } catch (err) {
      setImportErr(err.response?.data?.error || 'Erro ao importar');
    } finally {
      setImporting(false);
    }
  }

  // Escapa um campo CSV (aspas se contiver separador, aspas ou quebra de linha)
  function csvField(v) {
    const s = (v ?? '').toString();
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function saveCSV(content, filename) {
    // BOM (﻿) faz o Excel abrir com acentos corretos
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const CSV_HEADER = 'sku;descricao_longa;descricao_curta;descricao_curta_2;local;comprimento_cm;largura_cm;altura_cm;peso_kg;tipo_envio;shopee_comprimento_cm;shopee_largura_cm;shopee_altura_cm;papelao_full_cm;papelao_shopee_cm';

  function downloadTemplate() {
    saveCSV(CSV_HEADER + '\nJP7-999;Exemplo Descricao Longa;Exemplo Curta;ALT EXEMPLO;A1;20;15;10;0.300;padrao;;;;;\n', 'modelo_skus.csv');
  }

  const [exporting, setExporting] = useState(false);
  async function exportAll() {
    setExporting(true);
    try {
      const res = await api.get('/skus'); // todos, sem filtro
      const rows = res.data.map(s =>
        [s.sku, s.descricao_longa, s.descricao_curta, s.descricao_curta_2, s.local, s.comprimento_cm, s.largura_cm, s.altura_cm, s.peso_kg, s.tipo_envio, s.shopee_comprimento_cm, s.shopee_largura_cm, s.shopee_altura_cm, s.papelao_full_cm, s.papelao_shopee_cm].map(csvField).join(';')
      );
      const stamp = new Date().toISOString().slice(0, 10);
      saveCSV(CSV_HEADER + '\n' + rows.join('\n') + '\n', `skus_${stamp}.csv`);
      showMessage(`${rows.length} SKU(s) exportado(s).`);
    } catch (err) {
      showMessage(err.response?.data?.error || 'Erro ao exportar SKUs', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function loadSKUs(q = '') {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/skus', { params: q ? { search: q } : {} });
      setSkus(res.data);
    } catch (err) {
      setError('Erro ao carregar SKUs: ' + (err.response?.data?.error || err.message));
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
    setEditId(null);
    setModal('create');
  }

  function openEdit(sku) {
    setForm({
      sku: sku.sku,
      descricao_longa: sku.descricao_longa || '',
      descricao_curta: sku.descricao_curta || '',
      descricao_curta_2: sku.descricao_curta_2 || '',
      local: sku.local || '',
      comprimento_cm: sku.comprimento_cm ?? '',
      largura_cm: sku.largura_cm ?? '',
      altura_cm: sku.altura_cm ?? '',
      peso_kg: sku.peso_kg ?? '',
      tipo_envio: sku.tipo_envio || '',
      embalagem_id: sku.embalagem_id ?? '',
      shopee_comprimento_cm: sku.shopee_comprimento_cm ?? '',
      shopee_largura_cm: sku.shopee_largura_cm ?? '',
      shopee_altura_cm: sku.shopee_altura_cm ?? '',
      papelao_full_cm: sku.papelao_full_cm ?? '',
      papelao_shopee_cm: sku.papelao_shopee_cm ?? '',
    });
    setEditId(sku.id);
    setModal('edit');
  }

  function closeModal() {
    setModal(null);
    setForm(emptyForm);
    setEditId(null);
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: name === 'sku' ? value.toUpperCase() : value }));
  }

  function handleTipoEnvio(v) {
    // Ao sair de "padrão", desvincula a embalagem (as medidas já digitadas ficam)
    setForm(f => ({ ...f, tipo_envio: v, ...(v !== 'padrao' ? { embalagem_id: '' } : {}) }));
  }

  function escolherEmbalagem(id) {
    const e = embMap[id];
    setForm(f => ({
      ...f,
      embalagem_id: id,
      // auto-preenche C×L×A (editável); peso segue manual
      ...(e ? { comprimento_cm: e.comprimento_cm ?? '', largura_cm: e.largura_cm ?? '', altura_cm: e.altura_cm ?? '' } : {}),
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.sku.trim()) return;
    setSaving(true);
    try {
      if (modal === 'edit' && editId) {
        await api.put(`/skus/${editId}`, form);
        showMessage('SKU atualizado com sucesso!');
      } else {
        await api.post('/skus', form);
        showMessage('SKU criado com sucesso!');
      }
      closeModal();
      loadSKUs(search);
    } catch (err) {
      showMessage(err.response?.data?.error || 'Erro ao salvar SKU', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setDeleting(true);
    try {
      await api.delete(`/skus/${id}`);
      showMessage('SKU deletado com sucesso!');
      setDeleteConfirm(null);
      loadSKUs(search);
    } catch (err) {
      showMessage(err.response?.data?.error || 'Erro ao deletar SKU', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function handleSearch(e) {
    setSearch(e.target.value);
    loadSKUs(e.target.value);
  }

  // Locais únicos para os chips + lista filtrada por localização (client-side)
  const locais = Array.from(
    new Set(skus.map(s => (s.local || '').trim()).filter(Boolean))
  ).sort();
  const skusVisiveis = localFilter
    ? skus.filter(s => (s.local || '').trim() === localFilter)
    : skus;

  return (
    <div>
      <div className="page-header">
        <h1>Gerenciar SKUs</h1>
        <p>Cadastre e edite os SKUs disponíveis para geração de etiquetas</p>
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
              placeholder="Buscar SKU, descrição ou local..."
              style={{paddingLeft: '34px'}}
            />
          </div>
          <button className="btn-outline" onClick={exportAll} disabled={exporting} title="Baixar todos os SKUs em CSV para editar e reenviar">
            {exporting
              ? <><span className="spinner" style={{width:13,height:13,borderWidth:2}} /> Exportando...</>
              : <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Exportar planilha
                </>}
          </button>
          <button className="btn-outline" onClick={() => { setImportOpen(true); setImportRows(null); setImportErr(''); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Importar planilha
          </button>
          <button className="btn-primary" onClick={openCreate}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Novo SKU
          </button>
        </div>

        {locais.length > 0 && (
          <div style={styles.localFilterBar}>
            <span style={styles.localFilterLabel}>Localização:</span>
            <button
              onClick={() => setLocalFilter('')}
              style={{...styles.localChip, ...(localFilter === '' ? styles.localChipActive : {})}}
            >
              Todos
            </button>
            {locais.map(l => (
              <button
                key={l}
                onClick={() => setLocalFilter(l === localFilter ? '' : l)}
                style={{...styles.localChip, ...(localFilter === l ? styles.localChipActive : {})}}
              >
                {l}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{padding:'40px', textAlign:'center'}}>
            <div className="spinner" style={{margin:'0 auto'}} />
            <p style={{marginTop:'12px',color:'var(--text-muted)'}}>Carregando...</p>
          </div>
        ) : skusVisiveis.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e0" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            <p>
              {localFilter
                ? `Nenhum SKU na localização "${localFilter}"`
                : search ? `Nenhum SKU encontrado para "${search}"` : 'Nenhum SKU cadastrado'}
            </p>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Descrição Curta</th>
                  <th>Descrição Longa</th>
                  <th>Local</th>
                  <th>Medidas</th>
                  <th style={{textAlign:'right'}}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {skusVisiveis.map(s => (
                  <tr key={s.id}>
                    <td><code style={styles.code}>{s.sku}</code></td>
                    <td>
                      {s.descricao_curta || <span style={{color:'var(--text-muted)'}}>—</span>}
                      {s.descricao_curta_2 && (
                        <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'3px',fontSize:'12px',fontWeight:'600',color:'var(--btn-primary)'}}>
                          <span style={{background:'var(--btn-primary)',color:'#fff',padding:'1px 6px',borderRadius:'10px',fontSize:'9.5px',fontWeight:'700'}}>Alt</span>
                          {s.descricao_curta_2}
                        </div>
                      )}
                    </td>
                    <td style={{maxWidth:'240px', color:'var(--text-secondary)'}}>
                      <span title={s.descricao_longa || ''}>
                        {s.descricao_longa
                          ? s.descricao_longa.length > 50
                            ? s.descricao_longa.slice(0,50) + '…'
                            : s.descricao_longa
                          : <span style={{color:'var(--text-muted)'}}>—</span>
                        }
                      </span>
                    </td>
                    <td>
                      {s.local
                        ? <span style={styles.localBadge}>{s.local}</span>
                        : <span style={{color:'var(--text-muted)'}}>—</span>
                      }
                    </td>
                    <td style={{whiteSpace:'nowrap', fontSize:'12.5px'}}>
                      {s.tipo_envio && TIPO_ENVIO_LABEL[s.tipo_envio] && (() => { const t = TIPO_ENVIO_LABEL[s.tipo_envio];
                        const nome = s.tipo_envio === 'padrao' ? (embMap[s.embalagem_id]?.nome || 'padrão') : '';
                        return <div style={{marginBottom:'2px'}}>
                          <span style={{display:'inline-block', padding:'1px 7px', borderRadius:'10px', fontSize:'11px', fontWeight:700, color:t.color, background:t.bg}}>{t.txt}{nome ? ' ' + nome : ''}</span>
                        </div>; })()}
                      {(s.comprimento_cm || s.largura_cm || s.altura_cm || s.peso_kg) ? (
                        (() => { const pv = pesoVolumetrico(s.comprimento_cm, s.largura_cm, s.altura_cm);
                          return <span title="C×L×A (cm) · peso (kg) · peso volumétrico (C×L×A÷6000)">
                            {(s.comprimento_cm != null || s.largura_cm != null || s.altura_cm != null)
                              && <span>{[s.comprimento_cm, s.largura_cm, s.altura_cm].map(v => v != null ? (+v) : '?').join('×')} cm</span>}
                            {s.peso_kg != null && <span style={{color:'var(--text-secondary)'}}> · {(+s.peso_kg)} kg</span>}
                            {pv != null && <div style={{fontSize:'11px', color:'var(--text-muted)'}}>vol {pv.toLocaleString('pt-BR', { minimumFractionDigits: pv < 1 ? 3 : 1, maximumFractionDigits: 3 })} kg</div>}
                          </span>; })()
                      ) : (s.tipo_envio === 'papelao' ? null : <span style={{color:'var(--text-muted)'}}>—</span>)}
                      {s.tipo_envio === 'papelao' && (s.papelao_full_cm != null || s.papelao_shopee_cm != null) && (
                        <div style={{fontSize:'11px', color:'#744210', marginTop:'2px'}}>
                          ✂️ Full {s.papelao_full_cm != null ? (+s.papelao_full_cm) + 'cm' : '—'} · Shopee {s.papelao_shopee_cm != null ? (+s.papelao_shopee_cm) + 'cm' : '—'}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{display:'flex', gap:'6px', justifyContent:'flex-end'}}>
                        <button
                          className="btn-outline"
                          style={{padding:'5px 10px'}}
                          onClick={() => openEdit(s)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn-danger"
                          style={{padding:'5px 10px'}}
                          onClick={() => setDeleteConfirm(s)}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={styles.tableFooter}>
              {skusVisiveis.length} SKU{skusVisiveis.length !== 1 ? 's' : ''} encontrado{skusVisiveis.length !== 1 ? 's' : ''}
              {localFilter ? ` na localização "${localFilter}"` : ''}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modal && (
        <div style={styles.modalOverlay} {...backdropHandlers(backdropDown, closeModal)}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{modal === 'edit' ? 'Editar SKU' : 'Novo SKU'}</h2>
              <button style={styles.closeBtn} onClick={closeModal}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave} style={styles.modalBody}>
              <div className="form-group">
                <label htmlFor="modal-sku">SKU *</label>
                <input
                  id="modal-sku"
                  name="sku"
                  value={form.sku}
                  onChange={handleFormChange}
                  placeholder="JP7-001"
                  maxLength={100}
                  required
                  disabled={modal === 'edit'}
                  style={modal === 'edit' ? {background:'#f7fafc'} : {}}
                />
                {modal === 'edit' && (
                  <div style={{fontSize:'11.5px',color:'var(--text-muted)',marginTop:'4px'}}>
                    O código SKU não pode ser alterado após criação
                  </div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="modal-desc-curta">Descrição Curta</label>
                <input
                  id="modal-desc-curta"
                  name="descricao_curta"
                  value={form.descricao_curta}
                  onChange={handleFormChange}
                  placeholder="Parafuso M8x30"
                  maxLength={100}
                />
                <div style={{fontSize:'11.5px',color:'var(--text-muted)',marginTop:'4px'}}>
                  Aparece na linha superior da etiqueta ({form.descricao_curta.length}/100)
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="modal-desc-curta-2">Descrição alternativa (opcional)</label>
                <input
                  id="modal-desc-curta-2"
                  name="descricao_curta_2"
                  value={form.descricao_curta_2}
                  onChange={handleFormChange}
                  placeholder="LTZ BRANCO"
                  maxLength={100}
                />
                <div style={{fontSize:'11.5px',color:'var(--text-muted)',marginTop:'4px'}}>
                  Segunda opção de texto para a etiqueta (ex.: LTZ BRANCO). Deixe em branco se não usar. ({form.descricao_curta_2.length}/100)
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="modal-desc-longa">Descrição Longa</label>
                <textarea
                  id="modal-desc-longa"
                  name="descricao_longa"
                  value={form.descricao_longa}
                  onChange={handleFormChange}
                  placeholder="Parafuso Sextavado M8x30 Zincado DIN 933"
                  maxLength={500}
                  rows={3}
                  style={{resize:'vertical'}}
                />
              </div>
              <div className="form-group">
                <label htmlFor="modal-local">Local de Armazenamento</label>
                <input
                  id="modal-local"
                  name="local"
                  value={form.local}
                  onChange={handleFormChange}
                  placeholder="A1-01"
                  maxLength={100}
                />
              </div>
              <div className="form-group">
                <label htmlFor="modal-tipo-envio">Tipo de envio</label>
                <select id="modal-tipo-envio" name="tipo_envio" value={form.tipo_envio} onChange={e => handleTipoEnvio(e.target.value)}>
                  <option value="">Não definido</option>
                  <option value="propria">Embalagem própria (do anúncio)</option>
                  <option value="padrao">Embalagem padrão (P/M/G)</option>
                  <option value="papelao">Rolo de papelão (Full × Shopee)</option>
                  <option value="sem">Sem embalagem (sempre embalar)</option>
                </select>
                {form.tipo_envio === 'padrao' && (
                  <div style={{marginTop:'8px'}}>
                    <label htmlFor="modal-embalagem" style={{fontSize:'12px', color:'var(--text-muted)'}}>Embalagem</label>
                    <select id="modal-embalagem" value={form.embalagem_id} onChange={e => escolherEmbalagem(e.target.value)}>
                      <option value="">Escolher...</option>
                      {embalagens.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.nome}{(e.comprimento_cm != null || e.largura_cm != null || e.altura_cm != null) ? ` (${[e.comprimento_cm, e.largura_cm, e.altura_cm].map(v => v != null ? (+v) : '?').join('×')} cm)` : ''}
                        </option>
                      ))}
                    </select>
                    <div style={{fontSize:'11.5px', color:'var(--text-muted)', marginTop:'4px'}}>
                      {embalagens.length === 0 ? 'Nenhuma embalagem cadastrada — crie em "Embalagens".' : 'As medidas abaixo são preenchidas pela embalagem (você pode ajustar). O peso é manual.'}
                    </div>
                  </div>
                )}
              </div>
              {form.tipo_envio !== 'papelao' && (
              <div className="form-group">
                <label>Medidas da embalagem (envio)</label>
                <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'8px'}}>
                  {[
                    { name:'comprimento_cm', label:'Compr. (cm)', ph:'20' },
                    { name:'largura_cm', label:'Larg. (cm)', ph:'15' },
                    { name:'altura_cm', label:'Alt. (cm)', ph:'10' },
                    { name:'peso_kg', label:'Peso (kg)', ph:'0,300' },
                  ].map(f => (
                    <div key={f.name}>
                      <label htmlFor={'modal-' + f.name} style={{fontSize:'11.5px', color:'var(--text-muted)', display:'block', marginBottom:'3px'}}>{f.label}</label>
                      <input id={'modal-' + f.name} name={f.name} type="number" min="0" step="any"
                        value={form[f.name]} onChange={handleFormChange} placeholder={f.ph} />
                    </div>
                  ))}
                </div>
                <div style={{fontSize:'11.5px', color:'var(--text-muted)', marginTop:'6px'}}>
                  {(() => { const pv = pesoVolumetrico(form.comprimento_cm, form.largura_cm, form.altura_cm);
                    return pv != null
                      ? <>Peso volumétrico calculado: <b>{pv.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</b> (C×L×A ÷ 6000)</>
                      : 'Preencha C, L e A para calcular o peso volumétrico. Opcional — preencha aos poucos.'; })()}
                </div>
              </div>
              )}
              {form.tipo_envio === 'papelao' && (
                <div className="form-group">
                  <label>Peso (kg)</label>
                  <input name="peso_kg" type="number" min="0" step="any" value={form.peso_kg} onChange={handleFormChange} placeholder="0,300" style={{maxWidth:'160px'}} />
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginTop:'10px'}}>
                    {[
                      { titulo:'Full (Mercado Livre)', c:'comprimento_cm', l:'largura_cm', a:'altura_cm', corte:'papelao_full_cm' },
                      { titulo:'Shopee', c:'shopee_comprimento_cm', l:'shopee_largura_cm', a:'shopee_altura_cm', corte:'papelao_shopee_cm' },
                    ].map(blk => {
                      const pv = pesoVolumetrico(form[blk.c], form[blk.l], form[blk.a]);
                      return (
                        <div key={blk.titulo} style={{border:'1px solid var(--border)', borderRadius:'8px', padding:'10px'}}>
                          <div style={{fontWeight:700, fontSize:'12.5px', marginBottom:'8px'}}>{blk.titulo}</div>
                          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'6px'}}>
                            {[[blk.c,'Compr.'],[blk.l,'Larg.'],[blk.a,'Alt.']].map(([n,lb]) => (
                              <div key={n}>
                                <label style={{fontSize:'11px', color:'var(--text-muted)', display:'block'}}>{lb} (cm)</label>
                                <input name={n} type="number" min="0" step="any" value={form[n]} onChange={handleFormChange} />
                              </div>
                            ))}
                          </div>
                          <div style={{marginTop:'8px'}}>
                            <label style={{fontSize:'11px', color:'var(--text-muted)', display:'block'}}>✂️ Papelão a cortar (cm)</label>
                            <input name={blk.corte} type="number" min="0" step="any" value={form[blk.corte]} onChange={handleFormChange} placeholder="ex.: 40" style={{maxWidth:'140px'}} />
                          </div>
                          <div style={{fontSize:'11px', color:'var(--text-muted)', marginTop:'6px'}}>
                            {pv != null ? <>Volumétrico: <b>{pv.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</b></> : 'C×L×A p/ volumétrico'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{display:'flex', gap:'8px', justifyContent:'flex-end', paddingTop:'8px', borderTop:'1px solid var(--border)'}}>
                <button type="button" className="btn-secondary" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={!form.sku.trim() || saving}>
                  {saving
                    ? <><span className="spinner" style={{width:13,height:13,borderWidth:2}} /> Salvando...</>
                    : modal === 'edit' ? 'Salvar Alterações' : 'Criar SKU'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {importOpen && (
        <div style={styles.modalOverlay} {...backdropHandlers(backdropDown, () => setImportOpen(false))}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Importar planilha (CSV)</h2>
              <button style={styles.closeBtn} onClick={() => setImportOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div style={styles.modalBody}>
              {importErr && <div className="alert alert-error" style={{marginBottom:'14px'}}>{importErr}</div>}

              <ol style={{margin:'0 0 14px', paddingLeft:'20px', fontSize:'13px', color:'var(--text-secondary)', lineHeight:1.7}}>
                <li>Baixe a planilha modelo</li>
                <li>Adicione ou edite os produtos</li>
                <li>Salve no Excel como <b>CSV</b> (Arquivo → Salvar como → CSV)</li>
                <li>Importe o arquivo aqui</li>
              </ol>

              <p style={{fontSize:'12px', color:'var(--text-muted)', marginBottom:'14px'}}>
                Colunas: <code style={styles.code}>sku</code>, <code style={styles.code}>descricao_longa</code>, <code style={styles.code}>descricao_curta</code>, <code style={styles.code}>descricao_curta_2</code>, <code style={styles.code}>local</code>, <code style={styles.code}>comprimento_cm</code>, <code style={styles.code}>largura_cm</code>, <code style={styles.code}>altura_cm</code>, <code style={styles.code}>peso_kg</code>, <code style={styles.code}>tipo_envio</code> (propria/padrao/sem). Só <b>sku</b> é obrigatório. SKUs já existentes são atualizados.
              </p>

              <div style={{marginBottom:'8px'}}>
                <button type="button" className="btn-outline" onClick={downloadTemplate}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Baixar planilha modelo
                </button>
              </div>
              <label style={{display:'block', fontSize:'12px', color:'var(--text-muted)', marginBottom:'4px'}}>Depois, escolha o arquivo preenchido:</label>
              <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{marginBottom:'14px'}} />
              {importRows && (() => {
                const novos = importRows.filter(r => r.isNew === true).length;
                const edits = importRows.filter(r => r.isNew === false).length;
                return (
                  <div style={{marginBottom:'14px'}}>
                    <div style={{display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'10px'}}>
                      <span style={styles.countPill}>{importRows.length} na planilha</span>
                      <span style={{...styles.countPill, ...styles.pillNew}}>{novos} novo{novos !== 1 ? 's' : ''}</span>
                      <span style={{...styles.countPill, ...styles.pillEdit}}>{edits} atualizaç{edits !== 1 ? 'ões' : 'ão'}</span>
                    </div>
                    <div style={styles.previewBox}>
                      <table style={{width:'100%', borderCollapse:'collapse', fontSize:'12.5px'}}>
                        <tbody>
                          {importRows.map((r, i) => (
                            <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                              <td style={{padding:'6px 8px'}}><code style={styles.code}>{r.sku}</code></td>
                              <td style={{padding:'6px 8px', color:'var(--text-secondary)'}}>{r.descricao_curta || r.descricao_longa || '—'}</td>
                              <td style={{padding:'6px 8px', textAlign:'right', whiteSpace:'nowrap'}}>
                                {r.isNew === true && <span style={{...styles.tag, ...styles.pillNew}}>Novo</span>}
                                {r.isNew === false && <span style={{...styles.tag, ...styles.pillEdit}}>Editando</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
              <div style={{display:'flex', gap:'8px', justifyContent:'flex-end', paddingTop:'8px', borderTop:'1px solid var(--border)'}}>
                <button className="btn-secondary" onClick={() => setImportOpen(false)}>Cancelar</button>
                <button className="btn-primary" onClick={doImport} disabled={!importRows || importRows.length === 0 || importing}>
                  {importing
                    ? <><span className="spinner" style={{width:13,height:13,borderWidth:2}} /> Importando...</>
                    : `Confirmar importação${importRows ? ` (${importRows.length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={styles.modalOverlay} {...backdropHandlers(backdropDown, () => setDeleteConfirm(null))}>
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
                Tem certeza que deseja excluir o SKU{' '}
                <strong style={{color:'var(--text-primary)'}}>{deleteConfirm.sku}</strong>?
                {deleteConfirm.descricao_curta && ` (${deleteConfirm.descricao_curta})`}
              </p>
              <p style={{color:'var(--btn-danger)', fontSize:'12.5px', marginBottom:'20px'}}>
                Esta ação não pode ser desfeita.
              </p>
              <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
                <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>
                  Cancelar
                </button>
                <button
                  className="btn-danger"
                  onClick={() => handleDelete(deleteConfirm.id)}
                  disabled={deleting}
                >
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
  localFilterBar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '16px',
  },
  localFilterLabel: {
    fontSize: '12.5px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginRight: '4px',
  },
  localChip: {
    minWidth: '34px',
    padding: '5px 12px',
    borderRadius: '20px',
    border: '1px solid var(--border)',
    background: '#fff',
    color: 'var(--text-secondary)',
    fontSize: '12.5px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.12s',
  },
  localChipActive: {
    background: 'var(--btn-primary)',
    borderColor: 'var(--btn-primary)',
    color: '#fff',
  },
  code: {
    background: '#f1f5f9',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '12.5px',
    fontFamily: 'monospace',
    color: '#2b6cb0',
  },
  localBadge: {
    background: '#e6fffa',
    color: '#276749',
    padding: '2px 7px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  tableFooter: {
    padding: '10px 14px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    borderTop: '1px solid var(--border)',
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
  countPill: {
    fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '14px',
    background: '#f1f5f9', color: 'var(--text-secondary)',
  },
  pillNew: { background: '#e4f2e9', color: '#276749' },
  pillEdit: { background: '#fff4e0', color: '#9a6a00' },
  tag: { fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '10px' },
  previewBox: {
    maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px',
  },
};
