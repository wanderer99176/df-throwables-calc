const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
} = require('electron')
const path = require('path')
const rawMouse = require('./rawMouseWin.cjs')

// 禁止连点 / 多开：第二次启动只唤起已有窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusExisting()
  })
}

/** @type {Electron.BrowserWindow | null} */
let rulerWin = null
/** @type {Electron.BrowserWindow | null} */
let maskWin = null
/** @type {Electron.BrowserWindow | null} */
let calcWin = null
let clickThrough = false
let slim = true
let followMouse = false
/** 每单位鼠标计数对应的仰角变化（度）。上移鼠标 → 仰角增加，故对 dy 取负 */
let degPerCount = 0.022
let invertY = true

const isDev = !app.isPackaged && process.env.DF_DESKTOP_DEV === '1'
const DEV_URL = process.env.DF_DEV_URL || 'http://127.0.0.1:5173'
const DIST_HTML = path.join(__dirname, '..', 'dist', 'index.html')

function focusExisting() {
  for (const w of [calcWin, rulerWin, maskWin]) {
    if (!w || w.isDestroyed()) continue
    if (w.isMinimized()) w.restore()
    if (w === maskWin) w.showInactive()
    else {
      w.show()
      w.focus()
    }
  }
}

function placeLeft(browserWindow) {
  const display = screen.getPrimaryDisplay()
  const { height: sh } = display.workAreaSize
  const { x: wx, y: wy } = display.workArea
  const w = 200
  const h = Math.min(sh - 20, 920)
  browserWindow.setBounds({
    x: wx + 8,
    y: wy + Math.floor((sh - h) / 2),
    width: w,
    height: h,
  })
}

/** 光学遮罩贴右侧，避免和左侧弹道尺叠在一起 */
function placeMask(browserWindow) {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.bounds
  const w = 120
  browserWindow.setBounds({
    x: x + width - w - 4,
    y,
    width: w,
    height,
  })
}

function placeCalc(browserWindow) {
  const display = screen.getPrimaryDisplay()
  const { width: sw, height: sh, x: wx, y: wy } = display.workArea
  const w = Math.min(1280, Math.max(960, sw - 80))
  const h = Math.min(860, Math.max(720, sh - 60))
  browserWindow.setBounds({
    x: wx + Math.floor((sw - w) / 2),
    y: wy + Math.floor((sh - h) / 2),
    width: w,
    height: h,
  })
}

function loadPage(browserWindow, query) {
  if (isDev) {
    const q = new URLSearchParams(query || {}).toString()
    browserWindow.loadURL(q ? `${DEV_URL}/?${q}` : `${DEV_URL}/`)
  } else if (query && Object.keys(query).length) {
    browserWindow.loadFile(DIST_HTML, { query })
  } else {
    browserWindow.loadFile(DIST_HTML)
  }
}

function sendFollowDelta(dx, dy) {
  if (!followMouse || !rulerWin) return
  const signedDy = invertY ? -dy : dy
  const dPitch = signedDy * degPerCount
  if (dPitch === 0) return
  rulerWin.webContents.send('desktop:mouse-delta', { dx, dy, dPitch })
}

function startMouseFollow() {
  if (!rulerWin) return { ok: false, reason: '窗口未就绪' }
  const result = rawMouse.start(rulerWin, (_dx, dy) => {
    sendFollowDelta(0, dy)
  })
  followMouse = !!(result && result.ok)
  if (rulerWin) {
    rulerWin.webContents.send('desktop:follow', {
      active: followMouse,
      ...result,
      degPerCount,
    })
  }
  return result
}

function stopMouseFollow() {
  followMouse = false
  rawMouse.stop()
  rulerWin?.webContents.send('desktop:follow', { active: false })
}

function createRulerWindow() {
  if (rulerWin && !rulerWin.isDestroyed()) {
    if (rulerWin.isMinimized()) rulerWin.restore()
    rulerWin.show()
    rulerWin.focus()
    return rulerWin
  }

  rulerWin = new BrowserWindow({
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
    title: 'DF尺子',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Raw Input / native handle 需要
    },
  })

  rulerWin.setAlwaysOnTop(true, 'screen-saver')
  rulerWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  placeLeft(rulerWin)

  rulerWin.webContents.setVisualZoomLevelLimits(1, 1)
  rulerWin.webContents.on('before-input-event', (event, input) => {
    if (!input.control && !input.meta) return
    if (input.type !== 'keyDown') return
    if (
      input.key === '+' ||
      input.key === '=' ||
      input.key === '-' ||
      input.key === '_' ||
      input.key === '0'
    ) {
      event.preventDefault()
    }
  })

  rulerWin.once('ready-to-show', () => {
    rulerWin?.show()
  })

  loadPage(rulerWin, { desktop: '1', slim: '1' })

  rulerWin.on('closed', () => {
    stopMouseFollow()
    clickThrough = false
    rulerWin = null
  })

  return rulerWin
}

/**
 * 纯光学仰角遮罩：全程点穿 + 不可聚焦，不抢游戏鼠标/视角。
 * 受垂直 FOV 限制，约 ±vFOV/2（16:9·FOV100 ≈ ±34°）。
 */
function createMaskWindow() {
  if (maskWin && !maskWin.isDestroyed()) {
    if (maskWin.isMinimized()) maskWin.restore()
    maskWin.showInactive()
    return maskWin
  }

  maskWin = new BrowserWindow({
    width: 120,
    height: 900,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    title: 'DF仰角遮罩',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  maskWin.setAlwaysOnTop(true, 'screen-saver')
  maskWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  placeMask(maskWin)
  maskWin.setIgnoreMouseEvents(true)

  maskWin.once('ready-to-show', () => {
    maskWin?.showInactive()
  })

  loadPage(maskWin, { mask: '1' })

  maskWin.on('closed', () => {
    maskWin = null
  })

  return maskWin
}

function createCalcWindow() {
  if (calcWin && !calcWin.isDestroyed()) {
    if (calcWin.isMinimized()) calcWin.restore()
    calcWin.show()
    calcWin.focus()
    return calcWin
  }

  calcWin = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    frame: true,
    transparent: false,
    backgroundColor: '#0a1018',
    autoHideMenuBar: false,
    show: false,
    title: '定点打击计算器',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  placeCalc(calcWin)

  calcWin.once('ready-to-show', () => {
    calcWin?.show()
  })

  loadPage(calcWin, null)

  calcWin.on('closed', () => {
    calcWin = null
  })

  return calcWin
}

function setClickThrough(enabled) {
  clickThrough = enabled
  if (!rulerWin) return
  if (enabled) {
    rulerWin.setIgnoreMouseEvents(true, { forward: true })
  } else {
    rulerWin.setIgnoreMouseEvents(false)
  }
  rulerWin.webContents.send('desktop:click-through', clickThrough)
}

function setPassthroughIgnore(ignore) {
  if (!rulerWin || !clickThrough) return
  if (ignore) rulerWin.setIgnoreMouseEvents(true, { forward: true })
  else rulerWin.setIgnoreMouseEvents(false)
}

function setSlim(next) {
  slim = !!next
  if (!rulerWin) return
  placeLeft(rulerWin)
  rulerWin.webContents.send('desktop:slim', slim)
}

function buildAppMenu() {
  const template = [
    {
      label: '窗口',
      submenu: [
        {
          label: '打开侧边尺（弹道）',
          click: () => createRulerWindow(),
        },
        {
          label: '打开仰角遮罩（光学）',
          click: () => createMaskWindow(),
        },
        {
          label: '打开计算器',
          click: () => createCalcWindow(),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出全部' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+X', () => {
    if (!rulerWin) return
    setClickThrough(!clickThrough)
  })
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (!rulerWin || rulerWin.isDestroyed()) {
      createRulerWindow()
      return
    }
    if (rulerWin.isVisible()) rulerWin.hide()
    else rulerWin.show()
  })
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (!maskWin || maskWin.isDestroyed()) {
      createMaskWindow()
      return
    }
    if (maskWin.isVisible()) maskWin.hide()
    else maskWin.showInactive()
  })
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    if (!rulerWin) return
    if (followMouse) stopMouseFollow()
    else startMouseFollow()
  })
  globalShortcut.register('CommandOrControl+Shift+0', () => {
    rulerWin?.webContents.send('desktop:pitch-zero')
  })
}

app.whenReady().then(() => {
  if (!gotLock) return
  buildAppMenu()
  // 默认只开计算器 + 弹道尺；光学遮罩按需（菜单 / Ctrl+Shift+M / 尺上「遮罩」）
  createCalcWindow()
  createRulerWindow()
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
  ipcMain.on('desktop:set-slim', (_e, enabled) => {
    setSlim(!!enabled)
  })
  ipcMain.on('desktop:close', () => {
    rulerWin?.close()
  })
  ipcMain.on('desktop:open-calc', () => {
    createCalcWindow()
  })
  ipcMain.on('desktop:open-mask', () => {
    createMaskWindow()
  })
  ipcMain.on('desktop:set-follow', (_e, enabled) => {
    if (enabled) startMouseFollow()
    else stopMouseFollow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createCalcWindow()
      createRulerWindow()
    }
  })
})

app.on('will-quit', () => {
  if (!gotLock) return
  stopMouseFollow()
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (!gotLock) return
  if (process.platform !== 'darwin') app.quit()
})
