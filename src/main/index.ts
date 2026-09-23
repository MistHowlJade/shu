import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'AI网文工作台',
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  /* 外链只放行 http/https,其余(含 file:、javascript: 等)一律忽略 */
  win.webContents.setWindowOpenHandler((details) => {
    try {
      const proto = new URL(details.url).protocol
      if (proto === 'https:' || proto === 'http:') void shell.openExternal(details.url)
    } catch {
      /* 非法 URL 直接忽略 */
    }
    return { action: 'deny' }
  })

  /* 应用页面不允许被导航到外部地址(拦截 target=_blank / window.location 跳转) */
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (url.startsWith('file://') || (devUrl && url.startsWith(devUrl))) return
    event.preventDefault()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
