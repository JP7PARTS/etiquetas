import React, { useState, useMemo } from 'react';
import api from '../../utils/api.js';
import moldeUrl from './molde_full.xlsx?url';

// Editor de um envio salvo, a partir do snapshot gravado (sem precisar dos relatórios).
// Mostra a tabela como estava quando o envio foi salvo e permite ajustar as quantidades,
// re-salvar (PUT) e exportar a planilha do ML.

const n1 = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = (n) => Math.round(Number(n) || 0).toLocaleString('pt-BR');
const keyOf = (it) => it.key || it.codigo_ml || (it.sku ? 'cross:' + it.sku : '');

const DEC_STYLE = {
  'Manter': { bg: '#bee3f8', fg: '#2a4365' },
  'Promover': { bg: '#c6f6d5', fg: '#22543d' },
  'Avaliar saída': { bg: '#feebc8', fg: '#7b341e' },
  'Ignorar': { bg: '#e2e8f0', fg: '#4a5568' },
  'Não enviar': { bg: '#fed7d7', fg: '#822727' },
};

export default function FullEnvioEditor({ envio, onClose, onSaved }) {
  const items = envio.items || [];
  const [ov, setOv] = useState({}); // key -> qty editada
  const [nome, setNome] = useState(envio.name || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [copiado, setCopiado] = useState(null);

  const finalOf = (it) => { const k = keyOf(it); return ov[k] != null ? ov[k] : (Number(it.qty) || 0); };
  const setFinal = (it, v) => {
    const k = keyOf(it);
    if (v === '' || v == null) { setOv(p => { const n = { ...p }; delete n[k]; return n; }); return; }
    setOv(p => ({ ...p, [k]: Math.max(0, parseInt(v, 10) || 0) }));
  };

  const janelas = envio.params?.janelas?.length ? envio.params.janelas : [7, 15, 30];
  const totalEnviar = useMemo(() => items.reduce((s, it) => s + finalOf(it), 0), [items, ov]);
  const linhasEnvio = useMemo(() => items.filter(it => finalOf(it) > 0).length, [items, ov]);

  const copiarTitulo = (it) => {
    const t = it.titulo || '';
    if (!t) return;
    const ok = () => { setCopiado(keyOf(it)); setTimeout(() => setCopiado(c => (c === keyOf(it) ? null : c)), 1200); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(ok).catch(() => {});
    else { try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); ok(); } catch {} }
  };

  async function salvar() {
    const nome2 = window.prompt('Nome do envio:', nome);
    if (!nome2 || !nome2.trim()) return;
    // Mantém o snapshot completo; só a quantidade (qty) é atualizada pela edição.
    const novosItens = items.map(it => ({ ...it, qty: finalOf(it) }));
    setSaving(true); setMsg('');
    try {
      await api.put(`/full/shipments/${envio.id}`, { name: nome2.trim(), params: envio.params || {}, items: novosItens });
      setNome(nome2.trim());
      setMsg('✅ Envio atualizado.');
      if (onSaved) onSaved();
    } catch (err) {
      setMsg('Erro ao salvar: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  }

  async function exportarML() {
    const itens = items.filter(it => finalOf(it) > 0 && it.sku && (it.codigo_ml || it.anuncio));
    if (itens.length === 0) { setMsg('Nenhum item com quantidade para exportar.'); return; }
    try {
      const XLSX = await import('xlsx');
      const buf = await (await fetch(moldeUrl)).arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets['Seleção de produtos'];
      let rr = 6;
      for (const it of itens) {
        XLSX.utils.sheet_add_aoa(ws, [[it.sku, String(it.gtin || ''), String(it.codigo_ml || ''), String(it.anuncio || ''), '', finalOf(it)]], { origin: 'A' + rr });
        rr++;
      }
      ws['!ref'] = 'A1:F' + (rr - 1);
      const d = new Date();
      XLSX.writeFile(wb, `envio_full_${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(2)}.xlsx`);
      const semCml = itens.filter(it => !it.codigo_ml).length;
      setMsg(`✅ Planilha do ML gerada (${itens.length} itens).` + (semCml ? ` (${semCml} sem Código ML — vão pelo SKU + MLB.)` : ''));
    } catch (err) {
      setMsg('Erro ao gerar a planilha: ' + (err.message || err));
    }
  }

  return (
    <div className="card" style={{ borderColor: 'var(--brand, #2b6cb0)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '17px' }}>✏️ Editando envio: {nome}</h2>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            {items.length} linhas · snapshot salvo (edite as quantidades sem precisar dos relatórios)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={exportarML}>📤 Exportar planilha do ML</button>
          <button className="btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : '💾 Atualizar envio'}</button>
          <button className="btn-outline" onClick={onClose}>Fechar</button>
        </div>
      </div>

      <div style={{ fontSize: '13.5px', fontWeight: 700, marginBottom: '10px' }}>
        {linhasEnvio} linhas · <span style={{ color: 'var(--brand, #2b6cb0)' }}>Enviar: {int(totalEnviar)} un</span>
      </div>
      {msg && <div className="alert alert-success" style={{ marginBottom: '10px' }}>{msg}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Tít.</th>
              <th>SKU</th><th>MLB</th><th>Código ML</th>
              <th style={{ textAlign: 'center' }}>Vel ({janelas.join('/')})</th>
              <th style={{ textAlign: 'right' }}>Estq Full</th>
              <th style={{ textAlign: 'right' }}>Cross</th>
              <th style={{ textAlign: 'right' }}>Sugestão</th>
              <th style={{ textAlign: 'center' }}>Enviar</th>
              <th>Decisão</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const k = keyOf(it);
              const ds = DEC_STYLE[it.decisao];
              return (
                <tr key={k}>
                  <td style={{ textAlign: 'center', cursor: 'pointer' }} title={(it.titulo || '') + ' — clique para copiar'} onClick={() => copiarTitulo(it)}>{copiado === k ? '✅' : 'ℹ️'}</td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{it.sku}</td>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px' }}>{it.anuncio ? 'MLB' + it.anuncio : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px' }}>{it.codigo_ml || '—'}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{it.vels?.length ? it.vels.map(n1).join('/') : n1(it.vel)}</td>
                  <td style={{ textAlign: 'right' }}>{int(it.estoque)}</td>
                  <td style={{ textAlign: 'right' }}>{int(it.cross)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{int(it.sugestao)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="number" min="0" value={ov[k] != null ? ov[k] : (it.qty ?? '')} onChange={e => setFinal(it, e.target.value)}
                      style={{ width: '68px', padding: '4px', textAlign: 'right' }} />
                  </td>
                  <td>{it.decisao ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11.5px', fontWeight: 700, color: ds ? ds.fg : 'inherit', background: ds ? ds.bg : 'transparent' }}>{it.decisao}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
