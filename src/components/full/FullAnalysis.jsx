import React, { useState, useMemo } from 'react';

const brl = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (n) => Math.round(n || 0).toLocaleString('pt-BR');

function exportCsv(name, header, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function FullAnalysis({ rows }) {
  const [champBy, setChampBy] = useState('valor'); // valor | qtd
  const [semanaCut, setSemanaCut] = useState(10);

  const resumo = useMemo(() => ({
    produtos: rows.length,
    unFull: rows.reduce((s, r) => s + r.ocupaEspaco, 0),
    rs30: rows.reduce((s, r) => s + r.rs30, 0),
    un30: rows.reduce((s, r) => s + r.un30, 0),
    presos: rows.reduce((s, r) => s + r.evitarDescarte + r.naoAptas + r.extraviadas, 0),
    semEstoqueVendendo: rows.filter(r => (r.semEstoque || (r.semanas != null && r.semanas <= 1)) && r.un30 > 0).length,
  }), [rows]);

  const campeoes = useMemo(() => {
    const key = champBy === 'valor' ? 'rs30' : 'un30';
    return [...rows].filter(r => r[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 20);
  }, [rows, champBy]);

  const parado = useMemo(() =>
    rows.filter(r => r.semanas != null && r.semanas >= semanaCut)
        .sort((a, b) => (b.semanas - a.semanas) || (b.ocupaEspaco - a.ocupaEspaco)),
    [rows, semanaCut]);

  const ruptura = useMemo(() =>
    rows.filter(r => (r.semEstoque || (r.semanas != null && r.semanas <= 2)) && r.un30 > 0)
        .sort((a, b) => b.un30 - a.un30),
    [rows]);

  const presos = useMemo(() =>
    rows.map(r => ({ ...r, preso: r.evitarDescarte + r.naoAptas + r.extraviadas }))
        .filter(r => r.preso > 0).sort((a, b) => b.preso - a.preso),
    [rows]);

  return (
    <div>
      {/* Resumo geral */}
      <div style={styles.cards}>
        <Card label="Produtos ativos" value={int(resumo.produtos)} />
        <Card label="Unidades no Full" value={int(resumo.unFull)} />
        <Card label="Vendas 30d (R$)" value={brl(resumo.rs30)} />
        <Card label="Vendas 30d (un)" value={int(resumo.un30)} />
        <Card label="Sem estoque vendendo" value={int(resumo.semEstoqueVendendo)} warn={resumo.semEstoqueVendendo > 0} />
        <Card label="Un. dinheiro preso" value={int(resumo.presos)} warn={resumo.presos > 0} />
      </div>

      {/* Campeões */}
      <Section
        title="🏆 Campeões de venda (30 dias)"
        right={
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setChampBy('valor')} style={{ ...styles.chip, ...(champBy === 'valor' ? styles.chipOn : {}) }}>Por valor (R$)</button>
            <button onClick={() => setChampBy('qtd')} style={{ ...styles.chip, ...(champBy === 'qtd' ? styles.chipOn : {}) }}>Por quantidade</button>
            <button className="btn-outline" style={styles.exp} onClick={() => exportCsv(
              `campeoes_${champBy}.csv`, ['Produto', 'SKU', 'Codigo ML', 'Un 30d', 'R$ 30d', 'Tempo estoque'],
              campeoes.map(r => [r.produto, r.sku, r.codigoMl, r.un30, r.rs30, r.tempoTxt]))}>CSV</button>
          </div>
        }>
        <Table rows={campeoes} cols={[
          { h: 'Produto', get: r => r.produto, grow: true },
          { h: 'SKU', get: r => r.sku, mono: true },
          { h: 'Un 30d', get: r => int(r.un30), num: true, strong: champBy === 'qtd' },
          { h: 'R$ 30d', get: r => brl(r.rs30), num: true, strong: champBy === 'valor' },
          { h: 'Tempo estoque', get: r => r.tempoTxt },
        ]} />
      </Section>

      {/* Estoque parado */}
      <Section
        title="🐢 Estoque parado (custo de armazenagem)"
        subtitle="Muito tempo pra esgotar = paga armazenagem. Reveja o quanto manda desses."
        right={
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>a partir de</span>
            {[8, 10, 12].map(w => (
              <button key={w} onClick={() => setSemanaCut(w)} style={{ ...styles.chip, ...(semanaCut === w ? styles.chipOn : {}) }}>{w} sem</button>
            ))}
            <button className="btn-outline" style={styles.exp} onClick={() => exportCsv(
              'estoque_parado.csv', ['Produto', 'SKU', 'Semanas', 'Ocupam espaco', 'Estoque medio', 'Un 30d'],
              parado.map(r => [r.produto, r.sku, r.semanas, r.ocupaEspaco, r.estMedio, r.un30]))}>CSV</button>
          </div>
        }>
        <Table rows={parado} empty="Nenhum produto acima do corte." cols={[
          { h: 'Produto', get: r => r.produto, grow: true },
          { h: 'SKU', get: r => r.sku, mono: true },
          { h: 'Semanas', get: r => r.tempoTxt, strong: true },
          { h: 'Ocupam espaço', get: r => int(r.ocupaEspaco), num: true },
          { h: 'Un 30d', get: r => int(r.un30), num: true },
        ]} />
      </Section>

      {/* Ruptura */}
      <Section
        title="🔴 Ruptura iminente (vende e está acabando)"
        subtitle="Sem estoque (ou quase) mas ainda vendendo — risco de perder venda."
        right={
          <button className="btn-outline" style={styles.exp} onClick={() => exportCsv(
            'ruptura.csv', ['Produto', 'SKU', 'Un 30d', 'Tempo estoque'],
            ruptura.map(r => [r.produto, r.sku, r.un30, r.tempoTxt]))}>CSV</button>
        }>
        <Table rows={ruptura} empty="Nenhum produto em ruptura vendendo." cols={[
          { h: 'Produto', get: r => r.produto, grow: true },
          { h: 'SKU', get: r => r.sku, mono: true },
          { h: 'Un 30d', get: r => int(r.un30), num: true, strong: true },
          { h: 'Tempo estoque', get: r => r.tempoTxt },
        ]} />
      </Section>

      {/* Dinheiro preso */}
      <Section
        title="💸 Dinheiro preso (não vendável)"
        subtitle="Unidades para evitar descarte, não aptas ou extraviadas."
        right={
          <button className="btn-outline" style={styles.exp} onClick={() => exportCsv(
            'dinheiro_preso.csv', ['Produto', 'SKU', 'Evitar descarte', 'Nao aptas', 'Extraviadas', 'Total preso'],
            presos.map(r => [r.produto, r.sku, r.evitarDescarte, r.naoAptas, r.extraviadas, r.preso]))}>CSV</button>
        }>
        <Table rows={presos} empty="Nenhuma unidade presa. 👍" cols={[
          { h: 'Produto', get: r => r.produto, grow: true },
          { h: 'SKU', get: r => r.sku, mono: true },
          { h: 'Evitar descarte', get: r => int(r.evitarDescarte), num: true },
          { h: 'Não aptas', get: r => int(r.naoAptas), num: true },
          { h: 'Total preso', get: r => int(r.preso), num: true, strong: true },
        ]} />
      </Section>
    </div>
  );
}

function Card({ label, value, warn }) {
  return (
    <div style={{ ...styles.card, ...(warn ? styles.cardWarn : {}) }}>
      <div style={styles.cardValue}>{value}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  );
}

function Section({ title, subtitle, right, children }) {
  return (
    <div className="card" style={{ marginTop: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '16px' }}>{title}</h2>
          {subtitle && <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Table({ rows, cols, empty }) {
  if (!rows.length) return <div className="empty-state" style={{ padding: '18px' }}><p>{empty || 'Sem dados.'}</p></div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead><tr>{cols.map((c, i) => <th key={i} style={c.num ? { textAlign: 'right' } : {}}>{c.h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {cols.map((c, ci) => (
                <td key={ci} style={{
                  ...(c.num ? { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } : {}),
                  ...(c.mono ? { fontFamily: 'monospace', fontSize: '12.5px' } : {}),
                  ...(c.strong ? { fontWeight: 700 } : {}),
                  ...(c.grow ? { maxWidth: '340px' } : {}),
                }}>{c.get(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' },
  card: { border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', background: '#fff' },
  cardWarn: { borderColor: '#f6ad55', background: '#fffaf0' },
  cardValue: { fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' },
  cardLabel: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' },
  chip: { padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'var(--btn-primary)', borderColor: 'var(--btn-primary)', color: '#fff' },
  exp: { padding: '5px 10px', fontSize: '12px' },
};
