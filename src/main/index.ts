import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { loadSettings } from './storage'

/* 开发模式开放远程调试端口,供自动化验证(如扫书结果核对)连接;打包版不受影响 */
if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

/** 启动即读盘取主题(含跟随系统),让窗口底色/标题栏按钮与首帧一致,避免深色用户看到白闪 */
function startupIsDark(): boolean {
  try {
    const theme = loadSettings().theme
    return theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  } catch {
    return false
  }
}

function createWindow(): void {
  const dark = startupIsDark()
  /* 开发模式给窗口/任务栏挂仓库内图标;打包后 exe 已内嵌 electron-builder 生成的图标 */
  const devIconPath = join(__dirname, '../../build/icon.png')
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'AI网文工作台',
    backgroundColor: dark ? '#0c0e12' : '#f3f3f5',
    ...(existsSync(devIconPath) ? { icon: devIconPath } : {}),
    autoHideMenuBar: true,
    /* 隐藏式标题栏:顶栏即标题栏(可拖动/双击最大化),Windows 用系统悬浮按钮 */
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: dark ? '#191d24' : '#ffffff',
            symbolColor: dark ? '#e9ecf1' : '#17181b',
            height: 48
          }
        }
      : process.platform === 'darwin'
        ? { trafficLightPosition: { x: 14, y: 16 } }
        : {}),
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
