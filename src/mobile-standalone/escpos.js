// ---------- ESC/POS ENCODER ----------
// Mirrors the desktop buildEscPos(): same bytes over TCP 9100, UTF-8 text.
// Returns base64 for the native ShopPrinter bridge. Concatenated.
function escposBytes(lines) {
  const enc = new TextEncoder();
  const out = [];
  const raw = (...b) => { for (let i = 0; i < b.length; i++) out.push(b[i] & 0xff); };
  const txt = (s) => { const u = enc.encode(String(s)); for (let i = 0; i < u.length; i++) out.push(u[i]); };
  const align = (a) => raw(0x1b, 0x61, a);
  const bold = (on) => raw(0x1b, 0x45, on ? 1 : 0);
  const dbl = (on) => raw(0x1d, 0x21, on ? 0x11 : 0x00);
  raw(0x1b, 0x40);
  for (const ln of (lines || [])) {
    if (typeof ln === 'string') { txt(ln + '\n'); continue; }
    if (ln.t === 'spacer') { txt('\n'); continue; }
    if (ln.t === 'divider') { align(0); txt((ln.text || '--------------------------------').slice(0, 48) + '\n'); continue; }
    const text = String(ln.text == null ? '' : ln.text);
    align(ln.t === 'center' ? 1 : ln.t === 'right' ? 2 : 0);
    if (ln.bold) bold(true);
    if (ln.size === 'double') dbl(true);
    txt(text + '\n');
    if (ln.bold) bold(false);
    if (ln.size === 'double') dbl(false);
  }
  raw(0x0a, 0x0a, 0x1d, 0x56, 0x00);
  const bytes = new Uint8Array(out);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
