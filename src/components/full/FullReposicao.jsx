import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../utils/api.js';
import { computeReposicao } from './calc.js';

const n1 = (n) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = (n) => Math.round(n || 0).toLocaleString('pt-BR');

const ALERT_STYLE = {
  'estoura cross': { bg: '#fed7d7', fg: '#822727' },
  'sem estoque full': { bg: '#feebc8', fg: '#7b341e' },
  'sem venda': { bg: '#e2e8f0', fg: '#4a5568' },
  'caindo forte': { bg: '#fefcbf', fg: '#744210' },
  'subindo forte': { bg: '#c6f6d5', fg: '#22543d' },
};

// resumo já parseado (da Análise). vendas = {7,15,30}, cross parseados aqui.
export default function FullReposicao({ resumo, vendas, cross }) {
  const [regra, setRegra] = useState('MAX');
  const [dias, setDias] = useState(30);
  const [overrides, setOverrides] = useState({}); // codigoMl -> qty final
  const [historico, setHistorico] = useState({}); // codigoMl -> total enviado
  const [notes, setNotes] = useState({});         // codigoMl -> nota
  const [sort, setSort] = useState({ key: 'sugestao', dir: 'desc' });
  const [busca, setBusca] = useState('');
  const [showOrfas, setShowOrfas] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/full/shipments/historico').then(r => {
      const map = {}; (r.data || []).forEach(x => { map[x.codigo_ml] = Number(x.total) || 0; });
      setHistorico(map);
    }).catch(() => {});
    api.get('/full/notes').then(r => {
      const map = {}; (r.data || []).forEach(x => { map[x.codigo_ml] = x.note || ''; });
      setNotes(map);
    }).catch(() => {});
  }, []);

  const { rows, meta } = useMemo(
    () => computeReposicao({ resumo, vendas, cross, params: { regra, diasCobertura: dias } }),
    [resumo, vendas, cross, regra, dias]
  );

  const finalOf = (r) => (overrides[r.codigoMl] != null ? overrides[r.codigoMl] : r.final);

  const view = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = rows;
    if (q) arr = arr.filter(r => r.sku.toLowerCase().includes(q) || (r.produto || '').toLowerCase().includes(q) || r.codigoMl.toLowerCase().includes(q));
    const key = sort.key, mul = sort.dir === 'asc' ? 1 : -1;
    const val = (r) => key === 'sugestao' ? finalOf(r) : key === 'vel' ? r.velEsc : key === 'cobertura' ? (r.coberturaDias ?? 1e9) : key === 'estoque' ? r.estoque : key === 'sku' ? r.sku : r.velEsc;
    return [...arr].sort((a, b) => {
      const va = val(a), vb = val(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * mul;
    });
  }, [rows, busca, sort, overrides]);

  const totalFinal = rows.reduce((s, r) => s + finalOf(r), 0);
  const linhasEnvio = rows.filter(r => finalOf(r) > 0).length;

  function setFinal(cml, v) {
    const q = Math.max(0, parseInt(v, 10) || 0);
    setOverrides(prev => ({ ...prev, [cml]: q }));
  }
  function saveNote(cml, text) {
    setNotes(prev => ({ ...prev, [cml]: text }));
    api.put(`/full/notes/${encodeURIComponent(cml)}`, { note: text }).catch(() => {});
  }
  function clickSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  }
  async function salvar() {
    const nome = window.prompt('Nome do envio:', `Envio Full ${new Date().toLocaleDateString('pt-BR')}`);
    if (!nome || !nome.trim()) return;
    const items = rows.filter(r => finalOf(r) > 0).map(r => ({ codigo_ml: r.codigoMl, sku: r.sku, qty: finalOf(r) }));
    if (items.length === 0) { setMsg('Nenhuma quantidade a enviar.'); return; }
    setSaving(true); setMsg('');
    try {
      await api.post('/full/shipments', { name: nome.trim(), params: { regra, diasCobertura: dias }, items });
      setMsg('✅ Envio salvo! (aparece em "envios salvos" e alimenta os últimos envios)');
      const r = await api.get('/full/shipments/historico');
      const map = {}; (r.data || []).forEach(x => { map[x.codigo_ml] = Number(x.total) || 0; });
      setHistorico(map);
    } catch (err) {
      setMsg('Erro ao salvar: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  }

  const th = (key, label, extra) => (
    <th onClick={key ? () => clickSort(key) : undefined}
      style={{ cursor: key ? 'pointer' : 'default', whiteSpace: 'nowrap', ...(extra || {}) }}>
      {label}{sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div>
      {/* Avisos de qualidade dos dados */}
      {!meta.validacao.ok && (
        <div className="alert alert-error" style={{ marginBottom: '10px' }}>
          ⚠️ Validação contra o ML: {meta.validacao.divergentes}/{meta.validacao.comparaveis} Códigos ML divergem &gt;2 un ({meta.validacao.pct.toFixed(0)}%).
          Esperado enquanto a <b>reconciliação de anúncios migrados</b> não entra — as vendas órfãs abaixo ainda não foram atribuídas.
        </div>
      )}
      <div className="alert" style={{ marginBottom: '12px', background: '#fffaf0', border: '1px solid #f6ad55', color: '#744210' }}>
        🧩 Vendas <b>órfãs</b> (anúncio sem grupo, ainda não atribuídas): 7d {int(meta.orfas[7])} · 15d {int(meta.orfas[15])} · <b>30d {int(meta.orfas[30])}</b>.
        <button className="btn-outline" style={{ marginLeft: '10px', padding: '3px 10px', fontSize: '12px' }} onClick={() => setShowOrfas(v => !v)}>
          {showOrfas ? 'ocultar' : 'ver lista'}
        </button>
        {showOrfas && (
          <div style={{ marginTop: '8px', maxHeight: '180px', overflowY: 'auto', fontSize: '12.5px' }}>
            {meta.orfas.lista.slice(0, 100).map((o, i) => (
              <div key={i}>• {o.un}× <b>{o.sku}</b> — anúncio {o.anuncio} — {o.titulo}</div>
            ))}
          </div>
        )}
      </div>

      {/* Parâmetros */}
      <div className="card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={styles.group}>
            <span style={styles.label}>Regra</span>
            {['MAX', 'MEDIA', 'MEDIANA'].map(r => (
              <button key={r} onClick={() => setRegra(r)} style={{ ...styles.chip, ...(regra === r ? styles.chipOn : {}) }}>{r}</button>
            ))}
          </div>
          <div style={styles.group}>
            <span style={styles.label}>Dias de cobertura</span>
            {[15, 30, 45, 60].map(d => (
              <button key={d} onClick={() => setDias(d)} style={{ ...styles.chip, ...(dias === d ? styles.chipOn : {}) }}>{d}</button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Span: 7d {n1(meta.span[7])} · 15d {n1(meta.span[15])} · 30d {n1(meta.span[30])}
          </div>
        </div>
      </div>

      {/* Barra de ação */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
        <input placeholder="Buscar SKU / produto / Código ML" value={busca} onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px' }} />
        <span style={{ fontSize: '14px', fontWeight: 700 }}>{linhasEnvio} linhas · {int(totalFinal)} un a enviar</span>
        <button className="btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : '💾 Salvar envio'}</button>
      </div>
      {msg && <div className="alert alert-success" style={{ marginBottom: '10px' }}>{msg}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ fontSize: '13px' }}>
          <thead>
            <tr>
              {th('sku', 'SKU')}
              <th>Produto</th>
              {th('vel', 'Vel (7/15/30)', { textAlign: 'right' })}
              {th('estoque', 'Estoque', { textAlign: 'right' })}
              {th('cobertura', 'Cobertura', { textAlign: 'right' })}
              <th style={{ textAlign: 'right' }}>Cross</th>
              {th('sugestao', 'Sugestão', { textAlign: 'right' })}
              <th style={{ textAlign: 'right' }}>Enviar</th>
              <th>Alertas</th>
              <th style={{ textAlign: 'right' }}>Últ. envios</th>
              <th>Anotação</th>
            </tr>
          </thead>
          <tbody>
            {view.map(r => (
              <tr key={r.codigoMl}>
                <td style={{ fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>{r.sku}</td>
                <td style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.produto}>{r.produto}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{n1(r.vel7)}/{n1(r.vel15)}/{n1(r.vel30)}</td>
                <td style={{ textAlign: 'right' }}>{int(r.estoque)}</td>
                <td style={{ textAlign: 'right' }}>{r.coberturaDias == null ? '—' : int(r.coberturaDias) + 'd'}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{int(r.crossSku)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{int(r.sugestao)}</td>
                <td style={{ textAlign: 'right' }}>
                  <input type="number" min="0" value={finalOf(r)} onChange={e => setFinal(r.codigoMl, e.target.value)}
                    style={{ width: '64px', padding: '4px 6px', textAlign: 'right', border: '1px solid var(--border)', borderRadius: '6px' }} />
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {r.alertas.map(a => {
                      const s = ALERT_STYLE[a] || { bg: '#e2e8f0', fg: '#4a5568' };
                      return <span key={a} style={{ background: s.bg, color: s.fg, fontSize: '10.5px', fontWeight: 700, padding: '2px 6px', borderRadius: '8px', whiteSpace: 'nowrap' }}>{a}</span>;
                    })}
                  </div>
                </td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{historico[r.codigoMl] ? int(historico[r.codigoMl]) : '—'}</td>
                <td>
                  <input defaultValue={notes[r.codigoMl] || ''} placeholder="—"
                    onBlur={e => { if (e.target.value !== (notes[r.codigoMl] || '')) saveNote(r.codigoMl, e.target.value); }}
                    style={{ width: '140px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  group: { display: 'flex', alignItems: 'center', gap: '6px' },
  label: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 },
  chip: { padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'var(--btn-primary)', borderColor: 'var(--btn-primary)', color: '#fff' },
};
