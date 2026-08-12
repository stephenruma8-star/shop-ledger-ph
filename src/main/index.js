const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, crashReporter } = require('electron');

// Single-instance lock — must run before anything else
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { process.exit(0); }
const lockPath = require('path').join(require('os').tmpdir(), 'shop-ledger-ph.lock');
let lockFd = null;
try {
  lockFd = require('fs').openSync(lockPath, 'wx');
  require('fs').writeFileSync(lockFd, String(process.pid));
} catch (e) {
  // Lock file exists — check if the PID inside is still alive
  try {
    const oldPid = parseInt(require('fs').readFileSync(lockPath, 'utf8').trim(), 10);
    process.kill(oldPid, 0);
    process.exit(0); // PID still running
  } catch (e2) {
    // PID not running — stale lock, remove and retry
    try { require('fs').unlinkSync(lockPath); } catch(e3) {}
    try {
      lockFd = require('fs').openSync(lockPath, 'wx');
      require('fs').writeFileSync(lockFd, String(process.pid));
    } catch (e4) { process.exit(0); }
  }
}
process.on('exit', () => { if (lockFd !== null) { try { require('fs').closeSync(lockFd); } catch(e){} try { require('fs').unlinkSync(lockPath); } catch(e){} } });
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });

const _log = function(m) {
  try { require('fs').appendFileSync(require('path').join(require('os').tmpdir(),'slp-crash.log'), new Date().toISOString()+' '+m+'\n'); }catch(e){}
};
const origEmit = process.emit;
process.emit = function(ev, ...a) {
  if (ev === 'uncaughtException') {
    const msg = 'UNCAUGHT: '+(a[0]?.message||a[0])+'\n'+(a[0]?.stack||'');
    _log(msg);
    try { dialog.showErrorBox('Shop Ledger PH - Error', msg); } catch(e) {}
    return true;
  }
  return origEmit.apply(this, [ev, ...a]);
};
process.on('unhandledRejection', function(e) { _log('UNHANDLED: '+(e?.message||e)); });
try { crashReporter.start({ submitURL: '', uploadToServer: false, ignoreSystemCrashHandler: true }); } catch(e) {}
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const axios = require('axios');
const net = require('net');
const { startWsServer } = require('./wsServer.js');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; if (autoUpdater) autoUpdater.autoCheckUpdates = false; autoUpdater.autoDownload = false; } catch (e) { console.error('autoUpdater not available:', e.message); }

let mainWindow, tray, lanServer, udpBroadcast, wsServer;
let isQuitting = false;
const LAN_PORT = 3456;
const UDP_PORT = 3457;
const WS_PORT = 3458;
const APP_CONFIG_PATH = path.join(app.getPath('userData'), 'app-prefs.json');
function readAppPrefs() {
  try { return JSON.parse(fs.readFileSync(APP_CONFIG_PATH, 'utf8')); } catch (e) { return {}; }
}
const _savedToken = readAppPrefs().lanToken;
let _lanToken = _savedToken || (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
if (!_savedToken) {
  try {
    const prefs = { ...readAppPrefs(), lanToken: _lanToken };
    fs.writeFileSync(APP_CONFIG_PATH, JSON.stringify(prefs, null, 2));
  } catch (e) { console.error('Failed to persist LAN token:', e.message); }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920, height: 1080, minWidth: 900, minHeight: 600,
    title: 'Shop Ledger PH',
    icon: path.join(__dirname, '../renderer/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'geolocation') { callback(true); }
    else { callback(false); }
  });
  mainWindow.setMenu(buildMenu());
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    if (readAppPrefs().closeToTray) {
      mainWindow.hide();
      mainWindow.webContents.send('hidden-to-tray');
    } else {
      mainWindow.webContents.send('confirm-exit');
    }
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setTimeout(() => checkForUpdates(), 3000);
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '../renderer/assets/icon.png');
    const trayIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    if (trayIcon.isEmpty()) return;
    tray = new Tray(trayIcon);
  tray.setToolTip('Shop Ledger PH');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow?.show() },
    { label: 'Backup', click: () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.webContents.send('shortcut', 'file-backup'); } }},
    { label: 'Email Backup', click: () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.webContents.send('shortcut', 'email-backup'); }}},
    { type: 'separator' },
    { label: `LAN: ${getLocalIP()}:${LAN_PORT}`, enabled: false },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); }}
  ]));
  tray.on('double-click', () => mainWindow?.show());
  } catch (e) { console.error('Tray error:', e.message); }
}

function getLocalIP() {
  const candidates = [];
  for (const name of Object.keys(os.networkInterfaces())) {
    for (const iface of os.networkInterfaces()[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const [x, y] = iface.address.split('.').map(Number);
      if (x === 169 && y === 254) continue;
      if (x === 100 && y >= 64 && y <= 127) continue;
      candidates.push(iface.address);
    }
  }
  return candidates[0] || '127.0.0.1';
}

function getTailscaleIP() {
  for (const name of Object.keys(os.networkInterfaces())) {
    for (const iface of os.networkInterfaces()[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const [x, y] = iface.address.split('.').map(Number);
      if (x === 100 && y >= 64 && y <= 127) return iface.address;
    }
  }
  return null;
}

function ensureFirewallRules() {
  if (!app.isPackaged) return;
  const cp = require('child_process');
  for (const [name, port] of [['Shop Ledger PH LAN 3456', String(LAN_PORT)], ['Shop Ledger PH WS 3458', String(WS_PORT)]]) {
    let exists = false;
    try {
      const out = cp.execFileSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`], { encoding: 'utf8', timeout: 10000 });
      exists = out.includes(name);
    } catch (e) {}
    if (exists) continue;
    try {
      cp.execFileSync('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=${name}`, 'dir=in', 'action=allow', 'protocol=TCP', `localport=${port}`, 'profile=any'], { encoding: 'utf8', timeout: 10000, stdio: 'ignore' });
      console.log(`Firewall rule added: ${name}`);
    } catch (e) { console.error('Firewall rule add failed:', e.message); }
  }
}

function setupAutoUpdater() {
  ipcMain.handle('download-update', () => { if (autoUpdater) autoUpdater.downloadUpdate(); });
  ipcMain.handle('install-update', () => { if (autoUpdater) { isQuitting = true; autoUpdater.quitAndInstall(); } });
  ipcMain.handle('check-update', () => {
    if (!autoUpdater || !app.isPackaged) {
      return { success: false, error: 'Auto-update is only available in the installed app. Run the new installer instead.' };
    }
    checkForUpdates();
    return { success: true };
  });
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.on('update-available', (info) => {
    mainWindow?.isDestroyed() || mainWindow?.webContents.send('update-available', info);
  });
  autoUpdater.on('update-not-available', () => {
    mainWindow?.isDestroyed() || mainWindow?.webContents.send('update-not-available');
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.isDestroyed() || mainWindow?.webContents.send('update-downloaded', info);
  });
  autoUpdater.on('download-progress', (p) => {
    if (mainWindow?.isDestroyed()) return;
    mainWindow.webContents.send('update-progress', {
      percent: Math.min(100, Math.max(0, Number(p && p.percent) || 0)),
      bytesPerSecond: (p && p.bytesPerSecond) || 0,
      transferred: (p && p.transferred) || 0,
      total: (p && p.total) || 0
    });
  });
  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err && err.message || err);
    mainWindow?.isDestroyed() || mainWindow?.webContents.send('update-error', (err && err.message) || 'Update check failed');
  });
}

function checkForUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  const https = require('https');
  https.get('https://api.github.com/repos/stephenruma8-star/shop-ledger-ph/releases/latest', { headers: { 'User-Agent': 'shop-ledger-ph' } }, (res) => {
    if (res.statusCode === 200) autoUpdater.checkForUpdates().catch(() => {});
    else console.log('No published releases yet, skipping update check');
  }).on('error', () => {});
}

function startLANServer() {
  const expressApp = express();
  expressApp.use(cors());
  expressApp.use(express.json({ limit: '100mb' }));
  expressApp.use((req, res, next) => {
    if (req.path === '/api/health' || req.path === '/' || req.path === '/manifest.webmanifest' || req.path.startsWith('/assets/')) return next();
    const token = req.headers['x-auth-token'] || req.query.token;
    if (token === _lanToken) return next();
    res.status(401).json({ error: 'Unauthorized' });
  });

  expressApp.get('/', (req, res) => {
    res.type('html').send(fs.readFileSync(path.join(__dirname, '../renderer/mobile.html'), 'utf8'));
  });

  expressApp.get('/manifest.webmanifest', (req, res) => {
    res.type('application/manifest+json').send(fs.readFileSync(path.join(__dirname, '../renderer/manifest.webmanifest'), 'utf8'));
  });

  expressApp.get('/assets/:file', (req, res) => {
    const name = path.basename(req.params.file);
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) return res.status(400).end();
    const p = path.join(__dirname, '../renderer/assets', name);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.type(name.endsWith('.png') ? 'image/png' : 'application/octet-stream').send(fs.readFileSync(p));
  });

  expressApp.get('/api/clients', async (req, res) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return res.status(503).json({ error: 'Window not ready' });
      const dump = await mainWindow.webContents.executeJavaScript('window.__app.getDBDump()');
      res.json(dump.clients);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.get('/api/inventory', async (req, res) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return res.status(503).json({ error: 'Window not ready' });
      const dump = await mainWindow.webContents.executeJavaScript('window.__app.getDBDump()');
      res.json((dump.inventory || []).map(i => ({
        id: i.id, name: i.name, price: parseFloat(i.sellPrice || i.price || 0) || 0,
        stock: i.stock || 0, lowStock: i.lowStock ?? i.minStock ?? 5, image: i.image || null,
        variants: i.variants || [], createdAt: i.createdAt
      })).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.get('/api/transactions', async (req, res) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return res.status(503).json({ error: 'Window not ready' });
      const dump = await mainWindow.webContents.executeJavaScript('window.__app.getDBDump()');
      const limit = Math.min(parseInt(req.query.limit) || 200, 500);
      const list = (dump.transactions || [])
        .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
        .slice(0, limit)
        .map(t => ({
          id: t.id, invoiceNo: t.invoiceNo, clientName: t.clientName, paymentMethod: t.paymentMethod,
          date: t.date, createdAt: t.createdAt, grandTotal: t.grandTotal, subtotal: t.subtotal,
          totalInterest: t.totalInterest, discount: t.discount, scDiscount: t.scDiscount,
          status: t.status, items: (t.items || []).length
        }));
      res.json(list);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.get('/api/stats', async (req, res) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return res.status(503).json({ error: 'Window not ready' });
      const dump = await mainWindow.webContents.executeJavaScript('window.__app.getDBDump()');
      const todayStr = new Date().toISOString().split('T')[0];
      const todayTx = (dump.transactions || []).filter(t => t.date === todayStr && t.status !== 'voided');
      const todaySales = todayTx.reduce((s, t) => s + (t.grandTotal || 0), 0);
      const todayExp = (dump.expenses || []).filter(e => e.date === todayStr);
      const todayExpTotal = todayExp.reduce((s, e) => s + (e.amount || 0), 0);
      const todayPay = (dump.payments || []).filter(p => p.date === todayStr);
      const todayPayTotal = todayPay.reduce((s, p) => s + (p.amount || 0), 0);
      const totalUtang = (dump.clients || []).reduce((s, c) => s + (c.balance || 0), 0);
      const lowStock = (dump.inventory || []).filter(i => (i.stock || 0) <= (i.lowStock ?? i.minStock ?? 5));
      const monthSales = (dump.transactions || []).filter(t => (t.date || '').startsWith(todayStr.slice(0, 7)) && t.status !== 'voided')
        .reduce((s, t) => s + (t.grandTotal || 0), 0);
      const monthPay = (dump.payments || []).filter(p => (p.date || '').startsWith(todayStr.slice(0, 7)))
        .reduce((s, p) => s + (p.amount || 0), 0);
      const monthExp = (dump.expenses || []).filter(e => (e.date || '').startsWith(todayStr.slice(0, 7)))
        .reduce((s, e) => s + (e.amount || 0), 0);
      res.json({
        clients: (dump.clients || []).length,
        inventory: (dump.inventory || []).length,
        totalUtang, lowStockCount: lowStock.length,
        todaySales, todayExpenses: todayExpTotal, todayCollected: todayPayTotal,
        todayProfit: todaySales - todayExpTotal,
        monthSales, monthCollected: monthPay, monthExpenses: monthExp,
        monthProfit: monthSales - monthExp,
        recent: (dump.transactions || [])
          .filter(t => t.status !== 'voided')
          .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
          .slice(0, 5)
          .map(t => ({ invoiceNo: t.invoiceNo, clientName: t.clientName, grandTotal: t.grandTotal, date: t.date }))
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.post('/api/payments', async (req, res) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return res.status(503).json({ error: 'Window not ready' });
      const { clientId, amount, type, date } = req.body;
      const amtNum = parseFloat(amount) || 0;
      const cId = JSON.stringify(clientId);
      const amt = JSON.stringify(amtNum);
      const payType = JSON.stringify(amtNum > 0 ? (type === 'Full' || type === 'Partial' ? type : null) : null);
      await mainWindow.webContents.executeJavaScript(`
        (async () => {
          const c = await dbGet('clients', ${cId});
          const balBefore = c ? (c.balance || 0) : 0;
          const pt = ${payType} || (${amt} >= balBefore ? 'Full' : 'Partial');
          await dbAdd('payments', { clientId: ${cId}, amount: ${amt}, type: pt, date: ${JSON.stringify(date || new Date().toISOString().split('T')[0])}, notes: ${JSON.stringify('')}, createdAt: new Date().toISOString() });
          if (c) await dbPut('clients', { ...c, balance: Math.max(0, balBefore - ${amt}) });
          try { await logAudit('payment', 'Mobile payment ' + (c ? c.name : 'client') + ' - ₱' + ${amt}.toFixed(2)); } catch (e) {}
          return { success: true };
        })()
      `);
      notifyDataChanged({ source: 'api', kind: 'payment' });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.post('/api/sales', async (req, res) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return res.status(503).json({ error: 'Window not ready' });
      const { clientId, items, paymentMethod, discount } = req.body;
      if (!items || !items.length) return res.status(400).json({ error: 'No items' });
      const exec = (js) => mainWindow.webContents.executeJavaScript(js);
      const invNos = JSON.parse(await exec(`JSON.stringify(state.transactions.filter(t=>t.invoiceNo?.startsWith('INV-')).map(t=>parseInt(t.invoiceNo.replace('INV-',''))||0))`));
      const nextNo = invNos.length > 0 ? Math.max(...invNos) + 1 : 1;
      const invoiceNo = 'INV-' + String(nextNo).padStart(5,'0');
      const subtotal = items.reduce((s, i) => s + ((i.qty||1) * (i.unitCost || 0)), 0);
      const totalInterest = items.reduce((s, i) => s + ((i.qty||1) * (i.unitCost || 0)) * ((i.intRate||0)/100), 0);
      const d = parseFloat(discount) || 0;
      const grandTotal = Math.max(0, subtotal + totalInterest - d);
      const clientData = clientId ? JSON.parse(await exec(`JSON.stringify(await dbGet('clients', ${JSON.stringify(clientId)}))`)) : null;
      const clientName = clientData ? clientData.name : 'Walk-in';
      const txnData = JSON.stringify({ invoiceNo, clientId: clientId || null, clientName, date: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString(), items: items.map(i => ({ ...i, amount: ((i.qty||1) * (i.unitCost || 0)) + ((i.qty||1) * (i.unitCost || 0)) * ((i.intRate||0)/100) })), subtotal, totalInterest, discount: d, scDiscount: 0, grandTotal, paymentMethod: paymentMethod || 'Cash', status: grandTotal <= 0 ? 'paid' : 'pending' });
      await exec(`dbAdd('transactions', ${txnData})`);
      await exec(`(async()=>{try{await logAudit('sale','Mobile sale ${invoiceNo} - ₱${grandTotal.toFixed(2)}');}catch(e){}})()`);
      for (const item of items) {
        let invId = item.invId;
        if (!invId && item.description) {
          invId = await exec(`(async()=>{
            const desc = ${JSON.stringify(String(item.description).trim())};
            const qty = ${Math.max(1, parseInt(item.qty) || 1)};
            const unitCost = ${item.unitCost || 0};
            if (!desc) return null;
            const all = await dbAll('inventory');
            const f = all.find(i => String(i.name || '').trim().toLowerCase() === desc.toLowerCase());
            if (f) return f.id;
            const n = { name: desc, description: '', sku: '', category: '', stock: qty, minStock: 5, lowStock: 5, costPrice: 0, sellPrice: unitCost, price: unitCost, image: null, variants: [], createdAt: new Date().toISOString() };
            const id = await dbAdd('inventory', n);
            try { await logAudit('inventory', 'Auto-created from sale: ' + desc); } catch (e) {}
            return id;
          })()`);
          item.invId = invId;
        }
        if (invId) await exec(`(async()=>{const i=await dbGet('inventory',${JSON.stringify(invId)});if(i){i.stock=(i.stock||0)-${parseInt(item.qty)||1};const vn=${JSON.stringify(item.variantName || null)};if(vn&&i.variants){const v=i.variants.find(x=>x.name===vn);if(v)v.stock=(v.stock||0)-${parseInt(item.qty)||1};}await dbPut('inventory',i);}})()`);
      }
      if (clientId) await exec(`(async()=>{const c=await dbGet('clients',${JSON.stringify(clientId)});if(c){c.balance=(c.balance||0)+${grandTotal};await dbPut('clients',c);}})()`);
      notifyDataChanged({ source: 'api', kind: 'sale' });
      res.json({ success: true, invoiceNo });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  try {
    lanServer = expressApp.listen(LAN_PORT, '0.0.0.0', () => {
      console.log(`LAN server at http://${getLocalIP()}:${LAN_PORT}`);
    });
  } catch (e) { console.error('LAN server error:', e.message); }
}

function startUDPBroadcast() {
  try {
    const dgram = require('dgram');
    udpBroadcast = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udpBroadcast.on('message', (msg, rinfo) => {
      try {
        const pkt = JSON.parse(msg.toString());
        if (pkt.type === 'update-signal' && mainWindow && !mainWindow.isDestroyed()) {
          const sender = pkt.hostName || rinfo.address;
          mainWindow.webContents.send('lan-update-signal', { from: sender, version: pkt.version || '?' });
        }
      } catch (e) {}
    });
    udpBroadcast.bind(UDP_PORT, () => {
      udpBroadcast.setBroadcast(true);
    });
  } catch (e) { console.error('UDP broadcast error:', e.message); }
}

function broadcastUpdateSignal() {
  if (!udpBroadcast) return;
  try {
    const msg = JSON.stringify({
      type: 'update-signal',
      version: app.getVersion(),
      hostName: os.hostname()
    });
    udpBroadcast.send(msg, 0, msg.length, UDP_PORT, '255.255.255.255');
  } catch (e) { console.error('broadcast error:', e.message); }
}

function notifyDataChanged(info) {
  if (wsServer) {
    try { wsServer.broadcast({ type: 'update', source: info?.source || 'app', kind: info?.kind || 'data' }); }
    catch (e) { console.error('WS broadcast error:', e.message); }
  }
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('lan-data-refresh', info || {});
  } catch (e) {}
}

function encryptData(data, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { salt: salt.toString('hex'), iv: iv.toString('hex'), data: encrypted };
}

function decryptData(encryptedObj, password) {
  const salt = Buffer.from(encryptedObj.salt, 'hex');
  const iv = Buffer.from(encryptedObj.iv, 'hex');
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

ipcMain.handle('signal-lan-update', () => {
  broadcastUpdateSignal();
  notifyDataChanged({ source: 'app', kind: 'signal' });
  return { success: true };
});

ipcMain.handle('save-encrypted-backup', async (event, { data, password, filename }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename || `backup-encrypted-${Date.now()}.enc`,
      filters: [{ name: 'Encrypted Backup', extensions: ['enc'] }]
    });
    if (result.canceled) return { success: false };
    const encrypted = encryptData(JSON.stringify(data), password);
    fs.writeFileSync(result.filePath, JSON.stringify(encrypted));
    return { success: true, path: result.filePath };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('load-encrypted-backup', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Encrypted Backup', extensions: ['enc'] }]
    });
    if (result.canceled) return { success: false };
    const content = fs.readFileSync(result.filePaths[0], 'utf8');
    return { success: true, data: JSON.parse(content) };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('send-sms', async (event, { apiKey, number, message }) => {
  try {
    const response = await axios.post('https://semaphore.co/api/v4/messages', {
      apikey: apiKey, number: number, message: message
    });
    return { success: true, data: response.data };
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
});

ipcMain.handle('send-email-backup', async (event, { smtp, to, data, filename }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: parseInt(smtp.port) || 587,
      auth: { user: smtp.user, pass: smtp.pass }
    });
    await transporter.sendMail({
      from: `"${smtp.fromName || 'Shop Ledger PH'}" <${smtp.user}>`,
      to, subject: `Shop Ledger PH Backup - ${new Date().toLocaleDateString()}`,
      text: 'Attached is your backup.',
      attachments: [{ filename: filename || `backup-${Date.now()}.json`, content: JSON.stringify(data, null, 2) }]
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('save-backup-file', async (event, { data, filename }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename || `backup-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled) return { success: false };
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
    return { success: true, path: result.filePath };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('decrypt-backup-data', async (event, { encrypted, password }) => {
  try {
    const decrypted = decryptData(encrypted, password);
    return { success: true, data: JSON.parse(decrypted) };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('load-backup-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled) return { success: false };
    const content = fs.readFileSync(result.filePaths[0], 'utf8');
    return { success: true, data: JSON.parse(content) };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('generate-mobile-qr', async () => {
  const url = `http://${getLocalIP()}:${LAN_PORT}?ws=${WS_PORT}&token=${_lanToken}`;
  const qr = await QRCode.toDataURL(url, { width: 300 });
  const tsIp = getTailscaleIP();
  let tailscale = null;
  if (tsIp) {
    const tsUrl = `http://${tsIp}:${LAN_PORT}?ws=${WS_PORT}&token=${_lanToken}`;
    tailscale = { url: tsUrl, qr: await QRCode.toDataURL(tsUrl, { width: 300 }) };
  }
  return { url, qr, token: _lanToken, wsPort: WS_PORT, tailscale };
});

ipcMain.handle('get-app-preferences', () => readAppPrefs());

ipcMain.handle('get-app-version', () => { try { return app.getVersion(); } catch (e) { return ''; } });

ipcMain.handle('set-app-preferences', async (event, prefs) => {
  const next = { ...readAppPrefs(), ...(prefs || {}) };
  try { fs.writeFileSync(APP_CONFIG_PATH, JSON.stringify(next, null, 2)); } catch (e) { console.error('Failed to save app prefs:', e.message); }
  if (typeof next.launchAtStartup === 'boolean') {
    try {
      app.setLoginItemSettings({ openAtLogin: next.launchAtStartup, path: process.execPath });
    } catch (e) { console.error('setLoginItemSettings failed:', e.message); }
  }
  return next;
});

ipcMain.handle('save-logo', async (event, { dataUrl }) => {
  try {
    const logoPath = path.join(app.getPath('userData'), 'logo.png');
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(logoPath, Buffer.from(base64Data, 'base64'));
    return { success: true, path: logoPath };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('get-logo', async () => {
  const logoPath = path.join(app.getPath('userData'), 'logo.png');
  if (fs.existsSync(logoPath)) {
    const data = fs.readFileSync(logoPath);
    return 'data:image/png;base64,' + data.toString('base64');
  }
  return null;
});

ipcMain.handle('select-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (result.canceled) return { success: false };
    return { success: true, path: result.filePaths[0] };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('open-external', async (event, url) => { require('electron').shell.openExternal(url); });
ipcMain.handle('rebuild-app', async () => {
  try {
    const { execSync } = require('child_process');
    const result = execSync('npm run build:win', { cwd: app.getAppPath(), timeout: 300000, windowsHide: true });
    return { success: true, output: result.toString().trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.on('exit-confirmed', () => { isQuitting = true; app.quit(); });
ipcMain.handle('save-encrypted-backup-to-path', async (event, { data, password, filename, folder }) => {
  try {
    const filePath = path.join(folder, filename);
    const encrypted = encryptData(JSON.stringify(data), password);
    fs.writeFileSync(filePath, JSON.stringify(encrypted));
    return { success: true, path: filePath };
  } catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('print-receipt', async (event, { html, width }) => {
  try {
    const printWin = new BrowserWindow({
      width: width || 380, height: 600, show: false, frame: false, webPreferences: { offscreen: true }
    });
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise(r => setTimeout(r, 500));
    printWin.webContents.print({ silent: true, printBackground: true, margins: { marginType: 'none' } }, (success) => {
      printWin.close();
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

function buildEscPos(lines) {
  const parts = [Buffer.from([0x1b, 0x40])];
  const align = (a) => Buffer.from([0x1b, 0x61, a]);
  const bold = (on) => Buffer.from([0x1b, 0x45, on ? 1 : 0]);
  const mode = (on) => Buffer.from([0x1d, 0x21, on ? 0x11 : 0x00]);
  for (const ln of lines) {
    if (typeof ln === 'string') { parts.push(Buffer.from(ln + '\n', 'utf8')); continue; }
    if (ln.t === 'spacer') { parts.push(Buffer.from('\n', 'utf8')); continue; }
    if (ln.t === 'divider') {
      parts.push(Buffer.concat([align(0), Buffer.from((ln.text || '--------------------------------').slice(0, 48) + '\n', 'utf8')]));
      continue;
    }
    const text = String(ln.text == null ? '' : ln.text);
    let p = align(ln.t === 'center' ? 1 : ln.t === 'right' ? 2 : 0);
    if (ln.bold) p = Buffer.concat([p, bold(true)]);
    if (ln.size === 'double') p = Buffer.concat([p, mode(true)]);
    p = Buffer.concat([p, Buffer.from(text + '\n', 'utf8')]);
    if (ln.bold) p = Buffer.concat([p, bold(false)]);
    if (ln.size === 'double') p = Buffer.concat([p, mode(false)]);
    parts.push(p);
  }
  parts.push(Buffer.from([0x0a, 0x0a, 0x1d, 0x56, 0x00]));
  return Buffer.concat(parts);
}

ipcMain.handle('print-thermal', async (event, { host, port, lines }) => {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port: parseInt(port, 10) || 9100 }, () => {
      sock.write(buildEscPos(lines || []), () => {
        sock.end();
        setTimeout(() => resolve({ success: true }), 300);
      });
    });
    sock.on('error', (err) => resolve({ success: false, error: err.message }));
    sock.setTimeout(10000, () => { sock.destroy(); resolve({ success: false, error: 'Timed out connecting to printer' }); });
  });
});

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'New Sale', accelerator: 'F2', click: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shortcut', 'new-sale'); } },
      { label: 'Record Bayad', accelerator: 'F3', click: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shortcut', 'new-payment'); } },
      { type: 'separator' },
      { label: 'Backup', click: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shortcut', 'file-backup'); } },
      { label: 'Email Backup', click: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shortcut', 'email-backup'); } },
      { type: 'separator' },
      { role: 'quit' }
    ]},
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] }
  ]);
}

app.whenReady().then(() => {
  try {
    setupAutoUpdater();
    createWindow();
    createTray();
    ensureFirewallRules();
    startLANServer();
    startUDPBroadcast();
    wsServer = startWsServer({
      port: WS_PORT,
      token: _lanToken,
      onMessage: (msg) => {
        if (msg.type === 'update') notifyDataChanged({ source: 'mobile', kind: 'data' });
      }
    });
  } catch (e) { console.error('Startup error:', e); }
}).catch(e => console.error('whenReady failed:', e));
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {
  if (lanServer) lanServer.close();
  if (udpBroadcast) try { udpBroadcast.close(); } catch(e) {}
  if (wsServer) try { wsServer.close(); } catch(e) {}
  if (process.platform !== 'darwin') app.quit();
});
