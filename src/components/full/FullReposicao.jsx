import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../utils/api.js';
import { computeReposicao } from './calc.js';
import moldeUrl from './molde_full.xlsx?url';

const n1 = (n) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = (n) => Math.round(n || 0).toLocaleString('pt-BR');
const fmtDia = (d) => { try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch { return ''; } };

const ALERT_STYLE = {
  'estoura cross': { bg: '#fed7d7', fg: '#822727' },
  'sem estoque full': { bg: '#feebc8', fg: '#7b341e' },
  'sem venda': { bg: '#e2e8f0', fg: '#4a5568' },
  'caindo forte': { bg: '#fefcbf', fg: '#744210' },
  'subindo forte': { bg: '#c6f6d5', fg: '#22543d' },
  'SKU já no Full': { bg: '#e9d8fd', fg: '#553c9a' },
  'a caminho': { bg: '#bee3f8', fg: '#2a4365' },
};

const DECISOES = ['Manter', 'Promover', 'Avaliar saída', 'Ignorar'];
const DEC_STYLE = {
  'Manter': { bg: '#bee3f8', fg: '#2a4365' },
  'Promover': { bg: '#c6f6d5', fg: '#22543d' },
  'Avaliar saída': { bg: '#feebc8', fg: '#7b341e' },
  'Ignorar': { bg: '#e2e8f0', fg: '#4a5568' },
  'Não enviar': { bg: '#fed7d7', fg: '#822727' },
};

// resumo já parseado. vendas = {7,15,30} (7/15 podem ser null), cross, desempenho opcionais.
export default function FullReposicao({ resumo, vendas, cross, desempenho }) {
  const [regra, setRegra] = useState('MAX');
  const [dias, setDias] = useState(30);
  const [janelasTxt, setJanelasTxt] = useState('7, 15, 30');
  const [reconciliar, setReconciliar] = useState(true);
  const [limiar2, setLimiar2] = useState(15);
  const [showRec, setShowRec] = useState(false);
  const [rank, setRank] = useState({ metodo: 'topN', topN: 50, corteUn: 20, corteRs: 500 });
  const [decFiltro, setDecFiltro] = useState('Todos');
  const [overrides, setOverrides] = useState({}); // codigoMl -> qty final
  const [historico, setHistorico] = useState({}); // codigoMl -> total enviado
  const [notes, setNotes] = useState({});         // codigoMl -> nota
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' });
  const [excluidos, setExcluidos] = useState(new Set());
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
    carregarExcluidos();
  }, []);

  function carregarExcluidos() {
    api.get('/full/excluidos').then(r => setExcluidos(new Set((r.data || []).map(x => x.sku)))).catch(() => {});
  }
  async function excluir(sku) {
    setExcluidos(prev => new Set(prev).add(sku)); // otimista
    try { await api.post('/full/excluidos', { sku, motivo: 'tamanho' }); } catch { carregarExcluidos(); }
  }
  async function restaurar(sku) {
    setExcluidos(prev => { const n = new Set(prev); n.delete(sku); return n; });
    try { await api.delete(`/full/excluidos/${encodeURIComponent(sku)}`); } catch { carregarExcluidos(); }
  }

  const janelas = useMemo(() => {
    const arr = janelasTxt.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => n > 0);
    return arr.length ? [...new Set(arr)].sort((a, b) => a - b) : [7, 15, 30];
  }, [janelasTxt]);

  const { rows, meta } = useMemo(
    () => computeReposicao({ resumo, vendas, cross, desempenho, excluidos, params: { regra, diasCobertura: dias, ranking: rank, janelas, reconciliar, limiar2 } }),
    [resumo, vendas, cross, desempenho, excluidos, regra, dias, rank, janelas, reconciliar, limiar2]
  );

  const finalOf = (r) => (overrides[r.key] != null ? overrides[r.key] : r.final);

  const view = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = rows;
    // "Todos" oculta os "Não enviar"; o chip "Não enviar" mostra só eles
    if (decFiltro === 'Todos') arr = arr.filter(r => r.decisao !== 'Não enviar');
    else arr = arr.filter(r => r.decisao === decFiltro);
    if (q) {
      const qm = q.replace(/^mlb/, '');
      arr = arr.filter(r =>
        r.sku.toLowerCase().includes(q) || (r.produto || '').toLowerCase().includes(q) || r.codigoMl.toLowerCase().includes(q) ||
        String(r.anuncio || '').toLowerCase().includes(qm) ||
        (r.anuncios || []).some(a => String(a.mlb || '').toLowerCase().includes(qm)));
    }
    const key = sort.key, mul = sort.dir === 'asc' ? 1 : -1;
    const val = (r) => key === 'rank' ? (r.rankPos ?? 1e9) : key === 'sugestao' ? finalOf(r) : key === 'vel' ? r.velEsc : key === 'cobertura' ? (r.coberturaDias ?? 1e9) : key === 'estoque' ? r.estoque : key === 'sku' ? r.sku : r.velEsc;
    return [...arr].sort((a, b) => {
      const va = val(a), vb = val(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * mul;
    });
  }, [rows, busca, sort, overrides, decFiltro]);

  // Totais respeitam o filtro atual (view)
  const totalFinal = view.reduce((s, r) => s + finalOf(r), 0);
  const linhasEnvio = view.filter(r => finalOf(r) > 0).length;

  function setFinal(key, v) {
    const q = Math.max(0, parseInt(v, 10) || 0);
    setOverrides(prev => ({ ...prev, [key]: q }));
  }
  function saveNote(cml, text) {
    setNotes(prev => ({ ...prev, [cml]: text }));
    api.put(`/full/notes/${encodeURIComponent(cml)}`, { note: text }).catch(() => {});
  }
  function clickSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  }

  async function exportarML() {
    const itens = rows.filter(r => finalOf(r) > 0 && r.codigoMl);
    if (itens.length === 0) { setMsg('Nenhum item com Código ML para exportar.'); return; }
    try {
      const XLSX = await import('xlsx');
      const buf = await (await fetch(moldeUrl)).arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets['Seleção de produtos'];
      let rr = 6;
      for (const r of itens) {
        XLSX.utils.sheet_add_aoa(ws, [[r.sku, String(r.gtin || ''), r.codigoMl, String(r.anuncio || ''), '', finalOf(r)]], { origin: 'A' + rr });
        rr++;
      }
      ws['!ref'] = 'A1:F' + (rr - 1);
      const d = new Date();
      const nome = `envio_full_${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(2)}.xlsx`;
      XLSX.writeFile(wb, nome);
      const promoverFora = rows.filter(r => r.decisao === 'Promover' && finalOf(r) > 0 && !r.codigoMl).length;
      setMsg(`✅ Planilha do ML gerada (${itens.length} itens).` + (promoverFora ? ` ⚠️ ${promoverFora} itens "Promover" ficaram de fora (ainda sem Código ML no Full — habilite-os no Full primeiro).` : ''));
    } catch (err) {
      setMsg('Erro ao gerar a planilha: ' + (err.message || err));
    }
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
      {/* Reconciliação de anúncios migrados */}
      {meta.reconciliadas.total > 0 && (
        <div className="alert" style={{ marginBottom: '10px', background: '#e6fffa', border: '1px solid #38b2ac', color: '#234e52' }}>
          🔗 <b>{int(meta.reconciliadas.total)}</b> vendas de anúncios migrados atribuídas ao Código ML certo (velocidade corrigida).
          <button className="btn-outline" style={{ marginLeft: '10px', padding: '3px 10px', fontSize: '12px' }} onClick={() => setShowRec(v => !v)}>
            {showRec ? 'ocultar' : 'ver lista'}
          </button>
          {showRec && (
            <div style={{ marginTop: '8px', maxHeight: '180px', overflowY: 'auto', fontSize: '12.5px' }}>
              {meta.reconciliadas.lista.slice(0, 100).map((o, i) => (
                <div key={i}>• {int(o.un)}× <b>{o.sku}</b> — anúncio {o.anuncio} → {o.destinos.join(', ')}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Conferência vs ML (informativo — divergência é esperada durante a migração do ML) */}
      <div className="alert" style={{ marginBottom: '10px', background: meta.validacao.pct > 40 ? '#fff5f5' : '#f7fafc', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '13px' }}>
        📋 Conferência vs "Vendas 30 dias" do ML: {meta.validacao.divergentes}/{meta.validacao.comparaveis} Códigos ML diferem &gt;2 un ({meta.validacao.pct.toFixed(0)}%).
        <span style={{ color: 'var(--text-muted)' }}> Parte é esperada (migração de anúncios). Só é sinal de alerta se subir muito de repente.</span>
      </div>
      {/* Órfãs restantes (cross-only ou migração não resolvida) */}
      <div className="alert" style={{ marginBottom: '12px', background: '#fffaf0', border: '1px solid #f6ad55', color: '#744210' }}>
        🧩 Vendas <b>órfãs</b> restantes (anúncio sem grupo, sobretudo do cross): {meta.janelas.map(D => `${D}d ${int(meta.orfas[D])}`).join(' · ')}.
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
            <input type="number" min="1" value={dias} onChange={e => setDias(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ ...styles.numInput, width: '64px' }} title="Digite qualquer número de dias de cobertura" />
          </div>
          <div style={styles.group}>
            <span style={styles.label}>Janelas (dias)</span>
            <input value={janelasTxt} onChange={e => setJanelasTxt(e.target.value)} placeholder="7, 15, 30"
              style={{ ...styles.numInput, width: '110px', textAlign: 'left' }} title="Períodos de conferência derivados do relatório (separados por vírgula)" />
          </div>
          <div style={styles.group}>
            <button onClick={() => setReconciliar(v => !v)} style={{ ...styles.chip, ...(reconciliar ? styles.chipOn : {}) }}
              title="Atribui vendas de anúncios migrados ao Código ML correto (pelo SKU/título)">
              {reconciliar ? '✓ ' : ''}Reconciliar migrados
            </button>
          </div>
          <div style={styles.group}>
            <span style={styles.label}>mín. un p/ 2º anúncio</span>
            <input type="number" min="1" value={limiar2} onChange={e => setLimiar2(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={styles.numInput} title="Mínimo de unidades (na maior janela) para sugerir um 2º anúncio de cross de um SKU que já está no Full" />
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Relatório: {n1(meta.realSpan)} dias{meta.dmin && meta.dmax ? ` (${fmtDia(meta.dmin)} → ${fmtDia(meta.dmax)})` : ''}
          </div>
        </div>
        {/* Ranking de "melhores" (define Manter/Promover) */}
        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
          <div style={styles.group}>
            <span style={styles.label}>Melhores por</span>
            {[['topN', 'Top N'], ['score', 'Score'], ['cortes', 'Cortes']].map(([m, lbl]) => (
              <button key={m} onClick={() => setRank(r => ({ ...r, metodo: m }))} style={{ ...styles.chip, ...(rank.metodo === m ? styles.chipOn : {}) }}>{lbl}</button>
            ))}
          </div>
          {rank.metodo !== 'cortes' ? (
            <div style={styles.group}>
              <span style={styles.label}>Top N</span>
              <input type="number" min="1" value={rank.topN} onChange={e => setRank(r => ({ ...r, topN: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                style={styles.numInput} />
            </div>
          ) : (
            <>
              <div style={styles.group}>
                <span style={styles.label}>≥ un/mês</span>
                <input type="number" min="0" value={rank.corteUn} onChange={e => setRank(r => ({ ...r, corteUn: Math.max(0, parseInt(e.target.value, 10) || 0) }))} style={styles.numInput} />
              </div>
              <div style={styles.group}>
                <span style={styles.label}>ou ≥ R$/mês</span>
                <input type="number" min="0" value={rank.corteRs} onChange={e => setRank(r => ({ ...r, corteRs: Math.max(0, parseInt(e.target.value, 10) || 0) }))} style={styles.numInput} />
              </div>
            </>
          )}
          <div style={{ marginLeft: 'auto', fontSize: '12.5px', color: 'var(--text-muted)' }}>
            {meta.temDesempenho ? 'ranking: relatório de desempenho' : 'ranking: vendas (sem desempenho)'}
          </div>
        </div>
      </div>

      {/* Filtro por decisão */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
        <span style={styles.label}>Decisão</span>
        <button onClick={() => setDecFiltro('Todos')} style={{ ...styles.chip, ...(decFiltro === 'Todos' ? styles.chipOn : {}) }}>Todos ({rows.length - (meta.decisoes['Não enviar'] || 0)})</button>
        {DECISOES.map(d => (
          <button key={d} onClick={() => setDecFiltro(d)} style={{ ...styles.chip, ...(decFiltro === d ? styles.chipOn : {}) }}>
            {d} ({meta.decisoes[d] || 0})
          </button>
        ))}
        {(meta.decisoes['Não enviar'] || 0) > 0 && (
          <button onClick={() => setDecFiltro('Não enviar')} style={{ ...styles.chip, ...(decFiltro === 'Não enviar' ? styles.chipOn : {}) }}>
            🚫 Não enviar ({meta.decisoes['Não enviar']})
          </button>
        )}
      </div>

      {/* Barra de ação */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
        <input placeholder="Buscar SKU / produto / Código ML / MLB" value={busca} onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px' }} />
        <span style={{ fontSize: '14px', fontWeight: 700 }}>{linhasEnvio} linhas · {int(totalFinal)} un a enviar</span>
        <button className="btn-outline" onClick={exportarML} title="Gera a planilha no modelo oficial do ML (colunas A–F)">📤 Exportar planilha do ML</button>
        <button className="btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : '💾 Salvar envio'}</button>
      </div>
      {msg && <div className="alert alert-success" style={{ marginBottom: '10px' }}>{msg}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <style>{`.repo-tbl th,.repo-tbl td{padding:8px 9px;}`}</style>
        <table className="repo-tbl" style={{ fontSize: '13px' }}>
          <thead>
            <tr>
              {th('rank', 'Rank', { textAlign: 'right' })}
              {th('sku', 'SKU')}
              <th style={{ textAlign: 'center' }} title="Título do anúncio (passe o mouse)">Tít.</th>
              <th>MLB</th>
              <th>Código ML</th>
              <th>Decisão</th>
              {th('vel', 'Vel (' + meta.janelas.join('/') + ')', { textAlign: 'right' })}
              {th('estoque', 'Estoque', { textAlign: 'right' })}
              {th('cobertura', 'Cobertura', { textAlign: 'right' })}
              <th style={{ textAlign: 'right' }}>Cross</th>
              {th('sugestao', 'Sugestão', { textAlign: 'right' })}
              <th style={{ textAlign: 'right' }}>Enviar</th>
              <th>Alertas</th>
              <th style={{ textAlign: 'right' }}>Últ. envios</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {view.map(r => (
              <tr key={r.key}>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.rankPos ? 'var(--text-primary)' : 'var(--text-muted)' }}>{r.rankPos ? '#' + r.rankPos : '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>{r.sku}</td>
                <td style={{ textAlign: 'center', cursor: 'help' }} title={r.tituloTop || r.produto}>ℹ️</td>
                <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px' }}
                  title={(r.anuncios && r.anuncios.length ? r.anuncios : []).map(a => `MLB${a.mlb} · ${int(a.un)}un${a.titulo ? ' · ' + a.titulo : ''}`).join('\n') || 'sem anúncio'}>
                  {r.anuncio ? <>MLB{r.anuncio}{r.anuncios && r.anuncios.length > 1 && <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}> +{r.anuncios.length - 1}</span>}</> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px' }}>
                  {r.codigoMl ? r.codigoMl : <span style={{ color: 'var(--text-muted)' }} title="nunca foi ao Full (adicionar/remover)">—</span>}
                </td>
                <td>
                  <span style={{ ...(DEC_STYLE[r.decisao] || {}), background: (DEC_STYLE[r.decisao] || {}).bg, color: (DEC_STYLE[r.decisao] || {}).fg, fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>{r.decisao}</span>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{r.vels.map(v => n1(v)).join('/')}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{int(r.estoque)}{r.aCaminho > 0 && <span style={{ color: '#2a4365', fontSize: '11px' }} title="unidades a caminho do Full (entrada pendente)"> +{int(r.aCaminho)}🚚</span>}</td>
                <td style={{ textAlign: 'right' }}>{r.coberturaDias == null ? '—' : int(r.coberturaDias) + 'd'}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{int(r.crossSku)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{int(r.sugestao)}</td>
                <td style={{ textAlign: 'right' }}>
                  <input type="number" min="0" value={finalOf(r)} onChange={e => setFinal(r.key, e.target.value)}
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
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{r.codigoMl && historico[r.codigoMl] ? int(historico[r.codigoMl]) : '—'}</td>
                <td>
                  {r.decisao === 'Não enviar'
                    ? <button className="btn-outline" style={{ padding: '3px 8px', fontSize: '11.5px' }} onClick={() => restaurar(r.sku)}>↩ voltar</button>
                    : <button className="btn-outline" style={{ padding: '3px 8px', fontSize: '11.5px' }} title="Não enviar ao Full (ex.: tamanho)" onClick={() => excluir(r.sku)}>🚫 não enviar</button>}
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
  numInput: { width: '70px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'right' },
};
