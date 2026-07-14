const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  sendEmailBackup: (config) => ipcRenderer.invoke('send-email-backup', config),
  saveBackupFile: (data, filename) => ipcRenderer.invoke('save-backup-file', { data, filename }),
  loadBackupFile: () => ipcRenderer.invoke('load-backup-file'),
  saveEncryptedBackup: (data, password, filename) => ipcRenderer.invoke('save-encrypted-backup', { data, password, filename }),
  loadEncryptedBackup: () => ipcRenderer.invoke('load-encrypted-backup'),
  decryptBackupData: (encrypted, password) => ipcRenderer.invoke('decrypt-backup-data', { encrypted, password }),
  sendSMS: (config) => ipcRenderer.invoke('send-sms', config),
  generateMobileQR: () => ipcRenderer.invoke('generate-mobile-qr'),
  saveLogo: (dataUrl) => ipcRenderer.invoke('save-logo', { dataUrl }),
  getLogo: () => ipcRenderer.invoke('get-logo'),
  onShortcut: (callback) => ipcRenderer.on('shortcut', (_, action) => callback(action)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, info) => callback(info)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, info) => callback(info)),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  signalLanUpdate: () => ipcRenderer.invoke('signal-lan-update'),
  onLanUpdateSignal: (callback) => ipcRenderer.on('lan-update-signal', (_, info) => callback(info)),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveEncryptedBackupToPath: (data, password, filename, folder) => ipcRenderer.invoke('save-encrypted-backup-to-path', { data, password, filename, folder }),
});