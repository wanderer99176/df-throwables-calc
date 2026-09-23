const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
} = require('electron')
const path = require('path')
const rawMouse = require('./rawMouseWin.cjs')

/** @type {Electron.BrowserWindow | null} */
let win = null
let clickThrough = false
let slim = true
let followMouse = false
/** 每单位鼠标计数对应的仰角变化（度）。上移鼠标 → 仰角增加，故对 dy 取负 */
let degPerCount = 0.022
let invertY = true

const isDev = !app.isPackaged && process.env.DF_DESKTOP_DEV === '1'
const DEV_URL = process.env.DF_DEV_URL || 'http://127.0.0.1:5173'

function placeLeft(browserWindow) {
  const display = screen.getPrimaryDisplay()
  const { width: sw, height: sh } = display.workAreaSize
  const { x: wx, y: wy } = display.workArea
  const w = slim ? 200 : Math.min(980, Math.floor(sw * 0.55))
  const h = Math.min(sh - 20, 920)
  browserWindow.setBounds({
    x: wx + 8,
    y: wy + Math.floor((sh - h) / 2),
    width: w,
    height: h,
  })
}

function sendFollowDelta(dx, dy) {
  if (!followMouse || !win) return
  const signedDy = invertY ? -dy : dy
  const dPitch = signedDy * degPerCount
  if (dPitch === 0) return
  win.webContents.send('desktop:mouse-delta', { dx, dy, dPitch })
}

function startMouseFollow() {
  if (!win) return { ok: false, reason: '窗口未就绪' }
  const result = rawMouse.start(win, (_dx, dy) => {
    sendFollowDelta(0, dy)
  })
  followMouse = !!(result && result.ok)
  if (win) win.webContents.send('desktop:follow', { active: followMouse, ...result, degPerCount })
  return result
}

function stopMouseFollow() {
  followMouse = false
  rawMouse.stop()
  win?.webContents.send('desktop:follow', { active: false })
}

function createWindow() {
  win = new BrowserWindow({
    width: 280,
    height: 900,
    minWidth: 150,
    minHeight: 480,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Raw Input / native handle 需要
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  placeLeft(win)

  win.webContents.setVisualZoomLevelLimits(1, 1)
  win.webContents.on('before-input-event', (event, input) => {
    if (!input.control && !input.meta) return
    if (input.type !== 'keyDown') return
    if (input.key === '+' || input.key === '=' || input.key === '-' || input.key === '_' || input.key === '0') {
      event.preventDefault()
    }
  })

  win.once('ready-to-show', () => {
    win?.show()
  })

  if (isDev) {
    win.loadURL(`${DEV_URL}/?desktop=1&slim=1`)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      query: { desktop: '1', slim: '1' },
    })
  }

  win.on('closed', () => {
    stopMouseFollow()
    win = null
  })
}

function setClickThrough(enabled) {
  clickThrough = enabled
  if (!win) return
  if (enabled) {
    // forward: true → 页面仍能收到 mousemove，便于顶栏悬停时临时恢复可点
    win.setIgnoreMouseEvents(true, { forward: true })
  } else {
    win.setIgnoreMouseEvents(false)
  }
  win.webContents.send('desktop:click-through', clickThrough)
}

/** 穿透模式下：鼠标在可点控件上时暂时关闭穿透，离开再开 */
function setPassthroughIgnore(ignore) {
  if (!win || !clickThrough) return
  if (ignore) win.setIgnoreMouseEvents(true, { forward: true })
  else win.setIgnoreMouseEvents(false)
}

function toggleSlim() {
  slim = !slim
  if (!win) return
  placeLeft(win)
  win.webContents.send('desktop:slim', slim)
}

function setSlim(next) {
  slim = !!next
  if (!win) return
  placeLeft(win)
  win.webContents.send('desktop:slim', slim)
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+X', () => {
    setClickThrough(!clickThrough)
  })
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (!win) return
    if (win.isVisible()) win.hide()
    else win.show()
  })
  // 开关鼠标跟随
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    if (followMouse) stopMouseFollow()
    else startMouseFollow()
  })
  // 仰角归零（对齐地平线时按）
  globalShortcut.register('CommandOrControl+Shift+0', () => {
    win?.webContents.send('desktop:pitch-zero')
  })
}

app.whenReady().then(() => {
  createWindow()
  registerShortcuts()

  ipcMain.handle('desktop:get-state', () => ({
    clickThrough,
    slim,
    isDev,
    followMouse,
    degPerCount,
    invertY,
    rawSupported: rawMouse.isSupported,
  }))
  ipcMain.on('desktop:set-click-through', (_e, enabled) => {
    setClickThrough(!!enabled)
  })
  ipcMain.on('desktop:set-passthrough-ignore', (_e, ignore) => {
    setPassthroughIgnore(!!ignore)
  })
  ipcMain.on('desktop:toggle-slim', () => {
    toggleSlim()
  })
  ipcMain.on('desktop:set-slim', (_e, enabled) => {
    setSlim(!!enabled)
  })
  ipcMain.on('desktop:close', () => {
    win?.close()
  })
  ipcMain.on('desktop:set-follow', (_e, enabled) => {
    if (enabled) startMouseFollow()
    else stopMouseFollow()
  })
  ipcMain.on('desktop:set-sens', (_e, payload) => {
    if (payload && typeof payload.degPerCount === 'number' && payload.degPerCount > 0) {
      degPerCount = payload.degPerCount
    }
    if (payload && typeof payload.invertY === 'boolean') {
      invertY = payload.invertY
    }
    win?.webContents.send('desktop:follow', {
      active: followMouse,
      degPerCount,
      invertY,
    })
  })
  ipcMain.handle('desktop:calibrate', (_e, payload) => {
    // payload: { mouseCounts, degrees } → degPerCount = degrees / counts
    const counts = Math.abs(Number(payload?.mouseCounts) || 0)
    const degrees = Math.abs(Number(payload?.degrees) || 0)
    if (counts < 1 || degrees < 0.1) {
      return { ok: false, reason: '标定样本不足' }
    }
    degPerCount = degrees / counts
    win?.webContents.send('desktop:follow', {
      active: followMouse,
      degPerCount,
      invertY,
    })
    return { ok: true, degPerCount }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  stopMouseFollow()
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
