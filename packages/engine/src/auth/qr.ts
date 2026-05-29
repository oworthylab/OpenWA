/**
 * Helpers used by both adapters to render an auth QR string into a
 * data-URL or terminal-friendly ASCII. The engine itself only emits the
 * `qr` string from Baileys; callers (dashboard, CLI) pick a renderer.
 */

import qrcode from 'qrcode';

export async function qrToDataUrl(qr: string): Promise<string> {
  return qrcode.toDataURL(qr, { margin: 1, width: 320 });
}

export async function qrToTerminal(qr: string): Promise<string> {
  return qrcode.toString(qr, { type: 'terminal', small: true });
}
