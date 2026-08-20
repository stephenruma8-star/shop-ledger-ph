import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

type Listener<T> = (info: T) => void

function on<T = void>(channel: string, callback: Listener<T>, map?: (event: IpcRendererEvent, ...args: unknown[]) => T): void {
  const listener = (event: IpcRendererEvent, ...args: unknown[]): void => {
    const value = map ? map(event, ...args) : (args[0] as T)
    callback(value)
  }
  ipcRenderer.on(channel, listener)
}

const api = {
  isElectron: true,
  db: {
    open: (): Promise<unknown> => ipcRenderer.invoke('db-open'),
    migrate: (dump: unknown): Promise<unknown> => ipcRenderer.invoke('db-migrate', { dump }),
    get: (store: string, id: number): Promise<unknown> => ipcRenderer.invoke('db-get', { store, id }),
    add: (store: string, obj: unknown): Promise<unknown> => ipcRenderer.invoke('db-add', { store, obj }),
    put: (store: string, obj: unknown): Promise<unknown> => ipcRenderer.invoke('db-put', { store, obj }),
    del: (store: string, id: number): Promise<unknown> => ipcRenderer.invoke('db-del', { store, id }),
    all: (store: string): Promise<unknown> => ipcRenderer.invoke('db-all', { store }),
    clear: (store: string): Promise<unknown> => ipcRenderer.invoke('db-clear', { store }),
    stats: (): Promise<unknown> => ipcRenderer.invoke('db-stats')
  },
  sendEmailBackup: (config: unknown): Promise<unknown> => ipcRenderer.invoke('send-email-backup', config),
  saveBackupFile: (data: unknown, filename: string): Promise<unknown> => ipcRenderer.invoke('save-backup-file', { data, filename }),
  loadBackupFile: (): Promise<unknown> => ipcRenderer.invoke('load-backup-file'),
  saveEncryptedBackup: (data: unknown, password: string, filename: string): Promise<unknown> => ipcRenderer.invoke('save-encrypted-backup', { data, password, filename }),
  loadEncryptedBackup: (): Promise<unknown> => ipcRenderer.invoke('load-encrypted-backup'),
  decryptBackupData: (encrypted: unknown, password: string): Promise<unknown> => ipcRenderer.invoke('decrypt-backup-data', { encrypted, password }),
  sendSMS: (config: unknown): Promise<unknown> => ipcRenderer.invoke('send-sms', config),
  generateMobileQR: (): Promise<unknown> => ipcRenderer.invoke('generate-mobile-qr'),
  rotateLanToken: (): Promise<unknown> => ipcRenderer.invoke('rotate-lan-token'),
  importJsonDump: (dump: unknown): Promise<unknown> => ipcRenderer.invoke('import-json-dump', { dump }),
  getAppPreferences: (): Promise<unknown> => ipcRenderer.invoke('get-app-preferences'),
  setAppPreferences: (prefs: unknown): Promise<unknown> => ipcRenderer.invoke('set-app-preferences', prefs),
  getAppVersion: (): Promise<unknown> => ipcRenderer.invoke('get-app-version'),
  getLogsInfo: (): Promise<unknown> => ipcRenderer.invoke('logs-info'),
  openLogsFolder: (): Promise<unknown> => ipcRenderer.invoke('open-logs-folder'),
  logRenderer: (level: string, message: string): void => ipcRenderer.send('log-renderer', { level, message }),
  onHiddenToTray: (callback: Listener<void>): void => on('hidden-to-tray', callback),
  saveLogo: (dataUrl: string): Promise<unknown> => ipcRenderer.invoke('save-logo', { dataUrl }),
  getLogo: (): Promise<unknown> => ipcRenderer.invoke('get-logo'),
  onShortcut: (callback: Listener<unknown>): void => on('shortcut', callback, (_e, action) => action),
  onUpdateAvailable: (callback: Listener<unknown>): void => on('update-available', callback, (_e, info) => info),
  onUpdateNotAvailable: (callback: Listener<void>): void => on('update-not-available', callback),
  onUpdateError: (callback: Listener<string>): void => on('update-error', callback, (_e, message) => message as string),
  onUpdateDownloaded: (callback: Listener<unknown>): void => on('update-downloaded', callback, (_e, info) => info),
  onUpdateProgress: (callback: Listener<unknown>): void => on('update-progress', callback, (_e, info) => info),
  checkUpdate: (): Promise<unknown> => ipcRenderer.invoke('check-update'),
  downloadUpdate: (): Promise<unknown> => ipcRenderer.invoke('download-update'),
  installUpdate: (): Promise<unknown> => ipcRenderer.invoke('install-update'),
  signalLanUpdate: (): Promise<unknown> => ipcRenderer.invoke('signal-lan-update'),
  onLanUpdateSignal: (callback: Listener<unknown>): void => on('lan-update-signal', callback, (_e, info) => info),
  selectFolder: (): Promise<unknown> => ipcRenderer.invoke('select-folder'),
  saveEncryptedBackupToPath: (data: unknown, password: string, filename: string, folder: string): Promise<unknown> => ipcRenderer.invoke('save-encrypted-backup-to-path', { data, password, filename, folder }),
  openExternal: (url: string): Promise<unknown> => ipcRenderer.invoke('open-external', url),
  rebuildApp: (): Promise<unknown> => ipcRenderer.invoke('rebuild-app'),
  onConfirmExit: (callback: Listener<void>): void => on('confirm-exit', callback),
  exitConfirmed: (): void => ipcRenderer.send('exit-confirmed'),
  printReceipt: (config: unknown): Promise<unknown> => ipcRenderer.invoke('print-receipt', config),
  printThermal: (config: unknown): Promise<unknown> => ipcRenderer.invoke('print-thermal', config),
  onLanDataRefresh: (callback: Listener<unknown>): void => on('lan-data-refresh', callback, (_e, info) => info),
  getLocalBackups: (): Promise<unknown> => ipcRenderer.invoke('get-local-backups'),
  createLocalBackup: (password: string): Promise<unknown> => ipcRenderer.invoke('create-local-backup', { password }),
  retryLocalBackup: (name: string, password: string): Promise<unknown> => ipcRenderer.invoke('retry-local-backup', { name, password }),
  syncSavedSqliteBackups: (): Promise<unknown> => ipcRenderer.invoke('sync-saved-sqlite-backups'),
  restoreLocalBackup: (name: string, password: string): Promise<unknown> => ipcRenderer.invoke('restore-local-backup', { name, password }),
  importJsonBackup: (password: string): Promise<unknown> => ipcRenderer.invoke('import-json-backup', { password }),
  runDbHealth: (action: string): Promise<unknown> => ipcRenderer.invoke('run-db-health', { action }),
  planCloudBackups: (): Promise<unknown> => ipcRenderer.invoke('plan-cloud-backups')
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api