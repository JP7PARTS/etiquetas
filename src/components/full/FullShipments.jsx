import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api.js';
import { parseFullResumo, parseVendas, parseCross, parseDesempenho } from './parsers.js';
import FullAnalysis from './FullAnalysis.jsx';
import FullReposicao from './FullReposicao.jsx';

function fmtDate(s) { try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; } }

// Os 5 relatórios crus que alimentam o cálculo (parsers entram na próxima fase)
const SLOTS = [
  { id: 'vendas30', label: 'Vendas (relatório de ~30 dias)', accept: '.xlsx' },
  { id: 'full', label: 'Estoque no Full', accept: '.xlsx' },
  { id: 'cross', label: 'Estoque do armazém (cross)', accept: '.csv' },
  { id: 'desemp', label: 'Desempenho de anúncios (opcional)', accept: '.xlsx' },
];

// Cache em memória (nível de módulo): mantém os arquivos e resultados ao navegar
// entre áreas do app (o componente desmonta, mas isto persiste na sessão).
const cache = { files: {}, analysis: null, repo: null };

export default function FullShipments({ user }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [files, setFiles] = useState(() => cache.files); // id -> File
  const [analysis, setAnalysis] = useState(() => cache.analysis); // linhas parseadas do Resumo do Full
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisErr, setAnalysisErr] = useState('');
  const [repo, setRepo] = useState(() => cache.repo);    // { resumo, vendas, cross } p/ reposição
  const [calcing, setCalcing] = useState(false);
  const [calcErr, setCalcErr] = useState('');
  const inputs = useRef({});

  useEffect(() => { loadLists(); }, []);
  useEffect(() => { cache.files = files; }, [files]);
  useEffect(() => { cache.analysis = analysis; }, [analysis]);
  useEffect(() => { cache.repo = repo; }, [repo]);

  function limparArquivos() {
    setFiles({}); setAnalysis(null); setRepo(null); setAnalysisErr(''); setCalcErr('');
    for (const s of SLOTS) if (inputs.current[s.id]) inputs.current[s.id].value = '';
  }

  async function loadLists() {
    setLoading(true); setError('');
    try {
      const res = await api.get('/full/shipments');
      setLists(res.data);
    } catch (err) {
      setError('Erro ao carregar envios: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  function pick(id, file) {
    setFiles(prev => ({ ...prev, [id]: file || null }));
    if (id === 'full') { setAnalysis(null); setAnalysisErr(''); }
    setRepo(null); setCalcErr('');
  }

  // Mínimo para calcular: vendas 30d + estoque Full + cross. 7/15 e desempenho são opcionais.
  const temMinimo = files.vendas30 && files.full && files.cross;

  async function calcular() {
    setCalcing(true); setCalcErr('');
    try {
      const [resumo, vendas, cross] = await Promise.all([
        parseFullResumo(files.full), parseVendas(files.vendas30), parseCross(files.cross),
      ]);
      const desempenho = files.desemp ? await parseDesempenho(files.desemp) : null;
      setRepo({ resumo, vendas, cross, desempenho });
    } catch (err) {
      setCalcErr(err.message || 'Erro ao processar os relatórios');
      setRepo(null);
    } finally {
      setCalcing(false);
    }
  }

  async function analisarFull() {
    const file = files.full;
    if (!file) return;
    setAnalyzing(true); setAnalysisErr('');
    try {
      const rows = await parseFullResumo(file);
      setAnalysis(rows);
    } catch (err) {
      setAnalysisErr(err.message || 'Erro ao ler o relatório do Full');
      setAnalysis(null);
    } finally {
      setAnalyzing(false);
    }
  }

  async function remove(l) {
    if (!window.confirm(`Excluir o envio "${l.name}"?`)) return;
    try {
      await api.delete(`/full/shipments/${l.id}`);
      setLists(ls => ls.filter(x => x.id !== l.id));
    } catch (err) {
      setError('Erro ao excluir: ' + (err.response?.data?.error || err.message));
    }
  }

  const carregados = SLOTS.filter(s => files[s.id]).length;

  return (
    <div>
      <div className="page-header">
        <h1>Envio Full</h1>
        <p>Planejamento de reposição do Mercado Livre Full — calcula quanto enviar de cada produto</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Upload dos 5 relatórios crus */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '16px' }}>Relatórios do período</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{carregados}/5 carregados</span>
            {carregados > 0 && (
              <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '12.5px' }}
                onClick={limparArquivos} title="Remove todos os relatórios carregados">🗑 Limpar arquivos</button>
            )}
          </div>
        </div>
        <div style={styles.slots}>
          {SLOTS.map(s => (
            <div key={s.id} style={styles.slot}>
              <div style={styles.slotLabel}>{s.label}</div>
              <input
                ref={el => { inputs.current[s.id] = el; }}
                type="file" accept={s.accept}
                onChange={e => pick(s.id, e.target.files?.[0])}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn-outline" style={{ padding: '5px 10px' }}
                  onClick={() => inputs.current[s.id]?.click()}>
                  {files[s.id] ? 'Trocar' : `Escolher (${s.accept})`}
                </button>
                {files[s.id] && (
                  <>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>✅ {files[s.id].name}</span>
                    <button className="btn-outline" style={{ padding: '3px 8px', fontSize: '12px' }}
                      onClick={() => { pick(s.id, null); if (inputs.current[s.id]) inputs.current[s.id].value = ''; }}>
                      remover
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap' }}>
          <button className="btn-primary" disabled={!files.full || analyzing} onClick={analisarFull}>
            {analyzing ? 'Analisando...' : '📊 Analisar Full'}
          </button>
          <button className="btn-primary" disabled={!temMinimo || calcing} onClick={calcular}
            title={temMinimo ? '' : 'Carregue no mínimo: Vendas 30 dias + Estoque Full + Cross'}>
            {calcing ? 'Calculando...' : '🧮 Calcular reposição'}
          </button>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Mínimo: 1 relatório de vendas + Full + Cross. O sistema fatia as janelas (7/15/30) pela data. Desempenho enriquece o ranking.
          </span>
        </div>
        {analysisErr && <div className="alert alert-error" style={{ marginTop: '10px' }}>{analysisErr}</div>}
        {calcErr && <div className="alert alert-error" style={{ marginTop: '10px' }}>{calcErr}</div>}
      </div>

      {repo && (
        <>
          <div className="page-header" style={{ marginTop: '18px', marginBottom: 0 }}>
            <h2 style={{ margin: 0 }}>Reposição sugerida</h2>
          </div>
          <FullReposicao resumo={repo.resumo} vendas={repo.vendas} cross={repo.cross} desempenho={repo.desempenho} />
        </>
      )}

      {analysis && (
        <>
          <div className="page-header" style={{ marginTop: '18px', marginBottom: 0 }}>
            <h2 style={{ margin: 0 }}>Análise do Full</h2>
          </div>
          <FullAnalysis rows={analysis} />
        </>
      )}

      {/* Histórico de envios salvos */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {loading ? 'Carregando...' : `${lists.length} envio${lists.length !== 1 ? 's' : ''} salvo${lists.length !== 1 ? 's' : ''}`}
          </span>
          <button className="btn-outline" onClick={loadLists}>Atualizar</button>
        </div>
        {loading ? null : lists.length === 0 ? (
          <div className="empty-state"><p>Nenhum envio salvo ainda.</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Nome</th><th>Linhas</th><th>Peças</th><th>Criado por</th><th>Quando</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lists.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{l.name}</td>
                    <td>{l.total_linhas}</td>
                    <td>{l.total_pecas}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{l.created_by_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '12.5px', color: 'var(--text-muted)' }}>{fmtDate(l.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button className="btn-danger" style={{ padding: '5px 10px' }} onClick={() => remove(l)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  slots: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' },
  slot: { border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' },
  slotLabel: { fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' },
  soon: { marginTop: '14px', padding: '10px 14px', background: '#fffbea', border: '1px solid #f6e05e', borderRadius: '8px', fontSize: '13px', color: '#744210' },
};
