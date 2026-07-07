const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  sendEmailBackup: (config) => ipcRenderer.invoke('send-email-backup', config),
  saveBackupFile: (data, filename) => ipcRenderer.invoke('save-backup-file', { data, filename }),
  saveEncryptedBackup: (data, password, filename) => ipcRenderer.invoke('save-encrypted-backup', { data, password, filename }),
  loadEncryptedBackup: () => ipcRenderer.invoke('load-encrypted-backup'),
  sendSMS: (config) => ipcRenderer.invoke('send-sms', config),
  generateMobileQR: () => ipcRenderer.invoke('generate-mobile-qr'),
  saveLogo: (dataUrl) => ipcRenderer.invoke('save-logo', { dataUrl }),
  getLogo: () => ipcRenderer.invoke('get-logo'),
  onShortcut: (callback) => ipcRenderer.on('shortcut', (_, action) => callback(action)),
});