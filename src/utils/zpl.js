/**
 * ZPL generation utilities for Zebra GC420T
 * Label size: 40x25mm at 203 DPI = 320x200 dots
 */

export function getModuleWidth(sku) {
  const len = sku.length;
  if (len <= 10) return 3;
  if (len <= 15) return 2;
  return 1;
}

export function generateZPL(sku, descricao_curta) {
  const moduleWidth = getModuleWidth(sku);
  const desc = (descricao_curta || sku)
    .replace(/[^\x20-\x7E\xC0-\xFF]/g, '')
    .substring(0, 100);

  return `^XA
^PW320
^LL200
^CI28
^FO10,5^A0N,20,20^FB300,2,2,^FD${desc}^FS
^FO10,50^BY${moduleWidth}^BCN,90,N,N,N^FD${sku}^FS
^FO10,148^A0N,18,18^FB300,1,,C^FD${sku}^FS
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
