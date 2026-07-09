const _log = function(m) {
  try { require('fs').appendFileSync(require('path').join(require('os').tmpdir(),'slp-crash.log'), new Date().toISOString()+' '+m+'\n'); }catch(e){}
};
const origEmit = process.emit;
process.emit = function(ev, ...a) {
  if (ev === 'uncaughtException') { _log('UNCAUGHT: '+(a[0]?.message||a[0])+'\n'+(a[0]?.stack||'')); return true; }
  return origEmit.apply(this, [ev, ...a]);
};
process.on('unhandledRejection', function(e) { _log('UNHANDLED: '+(e?.message||e)); });

const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, crashReporter } = require('electron');
try { crashReporter.start({ submitURL: '', uploadToServer: false, ignoreSystemCrashHandler: true }); } catch(e) {}
try { dialog.showErrorBox = function(){}; } catch(e) {}
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const axios = require('axios');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; if (autoUpdater) autoUpdater.autoCheckUpdates = false; autoUpdater.autoDownload = false; } catch (e) { console.error('autoUpdater not available:', e.message); }

let mainWindow, tray, lanServer, udpBroadcast;
let isQuitting = false;
let _lanToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const LAN_PORT = 3456;
const UDP_PORT = 3457;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: 'Shop Ledger PH',
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  mainWindow.loadFile('shop-ledger-ph.html');
  mainWindow.setMenu(buildMenu());
  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setTimeout(() => checkForUpdates(), 3000);
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets/icon.png');
    const trayIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    if (trayIcon.isEmpty()) return;
    tray = new Tray(trayIcon);
  tray.setToolTip('Shop Ledger PH');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow?.show() },
    { label: 'Backup', click: () => { mainWindow?.show(); mainWindow?.webContents.send('shortcut', 'file-backup'); }},
    { label: 'Email Backup', click: () => { mainWindow?.show(); mainWindow?.webContents.send('shortcut', 'email-backup'); }},
    { type: 'separator' },
    { label: `LAN: ${getLocalIP()}:${LAN_PORT}`, enabled: false },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); }}
  ]));
  tray.on('double-click', () => mainWindow?.show());
  } catch (e) { console.error('Tray error:', e.message); }
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function setupAutoUpdater() {
  ipcMain.handle('download-update', () => { if (autoUpdater) autoUpdater.downloadUpdate(); });
  ipcMain.handle('install-update', () => { if (autoUpdater) { isQuitting = true; autoUpdater.quitAndInstall(); } });
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info);
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
    if (req.path === '/api/health' || req.path === '/') return next();
    const token = req.headers['x-auth-token'] || req.query.token;
    if (token === _lanToken) return next();
    res.status(401).json({ error: 'Unauthorized' });
  });

  expressApp.get('/', (req, res) => {
    res.type('html').send(fs.readFileSync(path.join(__dirname, 'mobile.html'), 'utf8'));
  });

  expressApp.get('/api/clients', async (req, res) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return res.status(503).json({ error: 'Window not ready' });
      const dump = await mainWindow.webContents.executeJavaScript('window.getDBDump()');
      res.json(dump.clients);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.post('/api/payments', async (req, res) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return res.status(503).json({ error: 'Window not ready' });
      const { clientId, amount, type, date } = req.body;
      const payData = JSON.stringify({ clientId, amount, type, date, createdAt: new Date().toISOString() });
      const cId = JSON.stringify(clientId);
      const amt = JSON.stringify(amount);
      await mainWindow.webContents.executeJavaScript(`
        (async () => {
          await dbAdd('payments', ${payData});
          const c = await dbGet('clients', ${cId});
          await dbPut('clients', { ...c, balance: (c.balance || 0) - ${amt} });
          return { success: true };
        })()
      `);
      res.json({ success: true });
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
      version: require('./package.json').version,
      hostName: os.hostname()
    });
    udpBroadcast.send(msg, 0, msg.length, UDP_PORT, '255.255.255.255');
  } catch (e) { console.error('broadcast error:', e.message); }
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
  const url = `http://${getLocalIP()}:${LAN_PORT}`;
  const qr = await QRCode.toDataURL(url, { width: 300 });
  return { url, qr, token: _lanToken };
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

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'New Sale', accelerator: 'F2', click: () => mainWindow?.webContents.send('shortcut', 'new-sale') },
      { label: 'Record Bayad', accelerator: 'F3', click: () => mainWindow?.webContents.send('shortcut', 'new-payment') },
      { type: 'separator' },
      { label: 'Backup', click: () => mainWindow?.webContents.send('shortcut', 'file-backup') },
      { label: 'Email Backup', click: () => mainWindow?.webContents.send('shortcut', 'email-backup') },
      { type: 'separator' },
      { role: 'quit' }
    ]},
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] }
  ]);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { console.log('Another instance running, quitting.'); app.exit(0); return; }
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });

app.whenReady().then(() => {
  try {
    setupAutoUpdater();
    createWindow();
    createTray();
    startLANServer();
    startUDPBroadcast();
  } catch (e) { console.error('Startup error:', e); }
}).catch(e => console.error('whenReady failed:', e));
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {
  if (lanServer) lanServer.close();
  if (udpBroadcast) try { udpBroadcast.close(); } catch(e) {}
  if (process.platform !== 'darwin') app.quit();
});
