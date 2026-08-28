import React from 'react';

// Campos de "Tipo de envio + medidas" reutilizáveis (cadastro de SKU e solicitações).
// Props: form (objeto com os campos), setForm (setter que aceita updater), embalagens (lista).

const nnum = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
export function pesoVolumetrico(c, l, a) {
  const nc = nnum(c), nl = nnum(l), na = nnum(a);
  if (!(nc > 0) || !(nl > 0) || !(na > 0)) return null;
  return (nc * nl * na) / 6000;
}
const fmtKg = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// Campos que este componente controla (para inicializar formulários)
export const PACKAGING_EMPTY = {
  tipo_envio: '', embalagem_id: '', comprimento_cm: '', largura_cm: '', altura_cm: '', peso_kg: '',
  shopee_comprimento_cm: '', shopee_largura_cm: '', shopee_altura_cm: '', papelao_full_cm: '', papelao_shopee_cm: '',
};
// Extrai os campos de embalagem de um objeto (ex.: um SKU já cadastrado) para pré-preencher formulários
export function packagingFrom(o = {}) { const r = {}; for (const k of Object.keys(PACKAGING_EMPTY)) r[k] = o[k] ?? ''; return r; }
// Falta alguma medida essencial (C/L/A/peso) — o ML pune
export function faltaMedidas(s) {
  const p = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0; };
  return !p(s?.comprimento_cm) || !p(s?.largura_cm) || !p(s?.altura_cm) || !p(s?.peso_kg);
}

export default function PackagingFields({ form, setForm, embalagens = [] }) {
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  function handleTipo(v) {
    set(v !== 'padrao' ? { tipo_envio: v, embalagem_id: '' } : { tipo_envio: v });
  }
  function escolherEmbalagem(id) {
    const e = embalagens.find(x => String(x.id) === String(id));
    set({ embalagem_id: id, ...(e ? { comprimento_cm: e.comprimento_cm ?? '', largura_cm: e.largura_cm ?? '', altura_cm: e.altura_cm ?? '' } : {}) });
  }
  const num = (name, val) => set({ [name]: val });

  return (
    <>
      <div className="form-group">
        <label>Tipo de envio</label>
        <select value={form.tipo_envio || ''} onChange={e => handleTipo(e.target.value)}>
          <option value="">Não definido</option>
          <option value="propria">Embalagem própria (do anúncio)</option>
          <option value="padrao">Embalagem padrão (P/M/G)</option>
          <option value="papelao">Rolo de papelão (Full × Shopee)</option>
          <option value="sem">Sem embalagem (sempre embalar)</option>
        </select>
        {form.tipo_envio === 'padrao' && (
          <div style={{ marginTop: '8px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Embalagem</label>
            <select value={form.embalagem_id || ''} onChange={e => escolherEmbalagem(e.target.value)}>
              <option value="">Escolher...</option>
              {embalagens.map(e => (
                <option key={e.id} value={e.id}>
                  {e.nome}{(e.comprimento_cm != null || e.largura_cm != null || e.altura_cm != null) ? ` (${[e.comprimento_cm, e.largura_cm, e.altura_cm].map(v => v != null ? (+v) : '?').join('×')} cm)` : ''}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {embalagens.length === 0 ? 'Nenhuma embalagem cadastrada.' : 'As medidas são preenchidas pela embalagem (pode ajustar). O peso é manual.'}
            </div>
          </div>
        )}
      </div>

      {form.tipo_envio !== 'papelao' ? (
        <div className="form-group">
          <label>Medidas da embalagem (envio)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[['comprimento_cm', 'Compr. (cm)', '20'], ['largura_cm', 'Larg. (cm)', '15'], ['altura_cm', 'Alt. (cm)', '10'], ['peso_kg', 'Peso (kg)', '0,300']].map(([n, lb, ph]) => (
              <div key={n}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>{lb}</label>
                <input type="number" min="0" step="any" value={form[n] ?? ''} onChange={e => num(n, e.target.value)} placeholder={ph} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px' }}>
            {(() => { const pv = pesoVolumetrico(form.comprimento_cm, form.largura_cm, form.altura_cm);
              return pv != null ? <>Peso volumétrico: <b>{fmtKg(pv)} kg</b> (C×L×A ÷ 6000)</> : 'Preencha C, L e A para o peso volumétrico.'; })()}
          </div>
        </div>
      ) : (
        <div className="form-group">
          <label>Peso (kg)</label>
          <input name="peso_kg" type="number" min="0" step="any" value={form.peso_kg ?? ''} onChange={e => num('peso_kg', e.target.value)} placeholder="0,300" style={{ maxWidth: '160px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
            {[
              { titulo: 'Mercado Livre', c: 'comprimento_cm', l: 'largura_cm', a: 'altura_cm', corte: 'papelao_full_cm' },
              { titulo: 'Shopee', c: 'shopee_comprimento_cm', l: 'shopee_largura_cm', a: 'shopee_altura_cm', corte: 'papelao_shopee_cm' },
            ].map(blk => {
              const pv = pesoVolumetrico(form[blk.c], form[blk.l], form[blk.a]);
              return (
                <div key={blk.titulo} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontWeight: 700, fontSize: '12.5px', marginBottom: '8px' }}>{blk.titulo}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    {[[blk.c, 'Compr.'], [blk.l, 'Larg.'], [blk.a, 'Alt.']].map(([n, lb]) => (
                      <div key={n}>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>{lb} (cm)</label>
                        <input type="number" min="0" step="any" value={form[n] ?? ''} onChange={e => num(n, e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>✂️ Papelão a cortar (cm)</label>
                    <input type="number" min="0" step="any" value={form[blk.corte] ?? ''} onChange={e => num(blk.corte, e.target.value)} placeholder="ex.: 40" style={{ maxWidth: '140px' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {pv != null ? <>Volumétrico: <b>{fmtKg(pv)} kg</b></> : 'C×L×A p/ volumétrico'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
