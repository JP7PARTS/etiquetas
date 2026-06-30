import React, { useState } from 'react';
import { downloadZPL, copyZPL, tryPrintZPL } from '../utils/zpl.js';

export default function ZPLOutput({ zpl, sku, descricao_curta }) {
  const [copied, setCopied] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState(null); // null | 'success' | 'error'
  const [printMessage, setPrintMessage] = useState('');

  async function handleCopy() {
    try {
      await copyZPL(zpl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Não foi possível copiar. Selecione o texto manualmente.');
    }
  }

  function handleDownload() {
    downloadZPL(zpl, sku);
  }

  async function handlePrint() {
    setPrinting(true);
    setPrintStatus(null);
    setPrintMessage('');
    try {
      await tryPrintZPL(zpl);
      setPrintStatus('success');
      setPrintMessage('Dados enviados à impressora com sucesso!');
    } catch (err) {
      setPrintStatus('error');
      setPrintMessage(err.message);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerLabel}>ZPL Gerado</div>
          <div style={styles.headerMeta}>
            <span style={styles.metaItem}>SKU: <strong>{sku}</strong></span>
            {descricao_curta && (
              <span style={styles.metaItem}>Desc: <strong>{descricao_curta}</strong></span>
            )}
            <span style={styles.metaItem}>40×25mm · 203 DPI · Zebra GC420T</span>
          </div>
        </div>
        <div style={styles.actions}>
          <button
            className="btn-outline"
            onClick={handleCopy}
            style={{ minWidth: '110px' }}
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Copiado!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copiar ZPL
              </>
            )}
          </button>
          <button className="btn-secondary" onClick={handleDownload}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Baixar .zpl
          </button>
          <button
            className="btn-success"
            onClick={handlePrint}
            disabled={printing}
          >
            {printing ? (
              <><span className="spinner" style={{width:14,height:14,borderWidth:2,borderTopColor:'#fff',borderColor:'rgba(255,255,255,0.3)'}} /> Enviando...</>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Tentar Imprimir
              </>
            )}
          </button>
        </div>
      </div>

      {printStatus === 'success' && (
        <div className="alert alert-success" style={{margin: '12px 0 0'}}>
          ✅ {printMessage}
        </div>
      )}

      {printStatus === 'error' && (
        <div className="alert alert-warning" style={{margin: '12px 0 0'}}>
          <strong>⚠️ Impressão via WebSocket falhou:</strong> {printMessage}
          <br /><br />
          <strong>Alternativas:</strong>
          <ul style={{marginTop: '6px', paddingLeft: '18px', lineHeight: 1.8}}>
            <li>Baixe o arquivo <code>.zpl</code> e imprima via <strong>Zebra Setup Utilities</strong></li>
            <li>Instale o <strong>Zebra Browser Print</strong> e tente novamente</li>
            <li>Copie o ZPL e cole no <strong>Labelary Online Viewer</strong> para testar</li>
          </ul>
        </div>
      )}

      <div style={styles.codeWrapper}>
        <pre style={styles.code}>{zpl}</pre>
      </div>

      <div style={styles.hint}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Pré-visualize em{' '}
        <a href="https://labelary.com/viewer.html" target="_blank" rel="noopener noreferrer" style={{color:'var(--btn-primary)'}}>
          labelary.com/viewer.html
        </a>
        {' '}· Configurar: 8 dpmm (203 DPI), 40×25mm
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: '#1a1f2e',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    marginTop: '20px',
    border: '1px solid #2d3748',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '14px 18px',
    background: '#0f1623',
    borderBottom: '1px solid #2d3748',
  },
  headerLabel: {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: '13px',
    marginBottom: '4px',
  },
  headerMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
  },
  metaItem: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: '12px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  codeWrapper: {
    padding: '20px',
    overflowX: 'auto',
  },
  code: {
    fontFamily: "'Courier New', 'Lucida Console', monospace",
    fontSize: '13px',
    lineHeight: '1.7',
    color: '#7dd3fc',
    background: 'none',
    margin: 0,
    whiteSpace: 'pre',
  },
  hint: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 18px',
    background: 'rgba(0,0,0,0.2)',
    borderTop: '1px solid #2d3748',
    color: 'rgba(255,255,255,0.35)',
    fontSize: '11.5px',
  },
};
