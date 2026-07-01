/**
 * ZPL generation utilities for Zebra GC420T
 * Label size: 40x25mm at 203 DPI = 320x200 dots
 */

// Total de módulos de um Code128: start + dados + checksum (11 cada) + stop (13)
export function codeModules(sku) {
  return 11 * (sku.length + 2) + 13;
}

// Largura do módulo calculada para o código de barras SEMPRE caber na etiqueta (320 dots)
export function getModuleWidth(sku) {
  const usable = 300; // 320 - margens de segurança (quiet zone)
  const mw = Math.floor(usable / codeModules(sku));
  return Math.max(1, Math.min(mw, 3));
}

export function normalizeQuantity(quantity) {
  return Math.max(1, Math.min(parseInt(quantity, 10) || 1, 999));
}

export function generateZPL(sku, descricao_curta, quantity) {
  const moduleWidth = getModuleWidth(sku);
  const desc = (descricao_curta || sku)
    .replace(/[^\x20-\x7E\xC0-\xFF]/g, '')
    .substring(0, 100);
  const qty = normalizeQuantity(quantity);

  // Centraliza o código de barras horizontalmente na etiqueta
  const barcodeWidth = codeModules(sku) * moduleWidth;
  const barcodeX = Math.max(6, Math.round((320 - barcodeWidth) / 2));

  return `^XA
^PW320
^LL200
^CI28
^FO10,22^A0N,20,20^FB300,2,2,^FD${desc}^FS
^FO${barcodeX},50^BY${moduleWidth}^BCN,100,N,N,N^FD${sku}^FS
^FO10,156^A0N,26,26^FB300,1,,C^FD${sku}^FS
^PQ${qty}
^XZ`;
}

export function downloadZPL(zpl, sku) {
  const blob = new Blob([zpl], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `etiqueta_${sku}.zpl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyZPL(zpl) {
  await navigator.clipboard.writeText(zpl);
}

export async function tryPrintZPL(zpl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:9100');
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout: impressora não respondeu'));
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      ws.send(zpl);
      setTimeout(() => {
        ws.close();
        resolve();
      }, 500);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Não foi possível conectar à impressora em ws://localhost:9100'));
    };
  });
}
