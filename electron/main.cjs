const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
} = require('electron')
const path = require('path')
const { execFileSync, execSync } = require('child_process')
const rawMouse = require('./rawMouseWin.cjs')

// 便携版每次解压路径不同，必须固定 userData，单实例锁才生效
app.setPath('userData', path.join(app.getPath('appData'), 'df-throwables-calc'))

const PACKAGED_EXE = 'DF投掷物尺子.exe'

function sleepMs(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  } catch {
    const end = Date.now() + ms
    while (Date.now() < end) {
      /* spin */
    }
  }
}

/**
 * 启动前先杀掉其它本应用进程，再抢锁。
 * 这样「再双击」= 旧的全关，新的接上，不会越开越多。
 */
function killStalePackagedProcesses() {
  if (process.platform !== 'win32') return
  const self = process.pid
  const parent = typeof process.ppid === 'number' ? process.ppid : -1
  try {
    execFileSync(
      'taskkill',
      ['/F', '/IM', PACKAGED_EXE, '/FI', `PID ne ${self}`],
      { stdio: 'ignore', windowsHide: true },
    )
  } catch {
    /* none */
  }
  // 其它 portable 宿主（绝不杀自己的父进程，否则子进程会被一起带走）
  try {
    execSync(
      `powershell -NoProfile -Command "$skip=@(${self},${parent}); Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'DF-Throwables-Ruler*' -and ($skip -notcontains $_.ProcessId) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore', windowsHide: true },
    )
  } catch {
    /* none */
  }
}

// 先清旧进程，再申请单实例（新启动优先）
if (app.isPackaged) {
  killStalePackagedProcesses()
  sleepMs(400)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // 仍有残留：再杀一轮后退出，用户再点一次即可；避免双进程并存
  if (app.isPackaged) {
    killStalePackagedProcesses()
  }
  app.exit(0)
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
const MASK_LAYOUT_PATH = path.join(app.getPath('userData'), 'mask-layout.json')
const MASK_W = 120

/** @type {{ xPercent: number, opacity: number }} */
let maskLayout = { xPercent: 0, opacity: 55 }

function loadMaskLayoutFile() {
  try {
    const raw = require('fs').readFileSync(MASK_LAYOUT_PATH, 'utf8')
    const o = JSON.parse(raw)
    if (Number.isFinite(o.xPercent)) maskLayout.xPercent = Math.min(100, Math.max(0, o.xPercent))
    if (Number.isFinite(o.opacity)) maskLayout.opacity = Math.min(100, Math.max(0, o.opacity))
  } catch {
    /* defaults */
  }
}

function saveMaskLayoutFile() {
  try {
    require('fs').mkdirSync(path.dirname(MASK_LAYOUT_PATH), { recursive: true })
    require('fs').writeFileSync(MASK_LAYOUT_PATH, JSON.stringify(maskLayout), 'utf8')
  } catch {
    /* ignore */
  }
}

function sliderToWindowOpacity(slider) {
  const t = Math.min(100, Math.max(0, slider)) / 100
  return 0.12 + 0.88 * t
}

/** 光学遮罩水平位置：xPercent 0=最左，100=最右 */
function placeMask(browserWindow, xPercent = maskLayout.xPercent) {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.bounds
  const w = MASK_W
  const pct = Math.min(100, Math.max(0, Number(xPercent) || 0))
  const left = Math.round(x + ((width - w) * pct) / 100)
  browserWindow.setBounds({
    x: left,
    y,
    width: w,
    height,
  })
}

function applyMaskLayout() {
  if (!maskWin || maskWin.isDestroyed()) return
  placeMask(maskWin, maskLayout.xPercent)
  try {
    maskWin.setOpacity(sliderToWindowOpacity(maskLayout.opacity))
  } catch {
    /* ignore */
  }
}

/** 关掉全部子窗，只留计算器（同进程内再次激活时） */
function resetToCalcOnly() {
  stopMouseFollow()
  clickThrough = false
  for (const w of [rulerWin, maskWin, calcWin]) {
    if (w && !w.isDestroyed()) {
      try {
        w.destroy()
      } catch {
        /* ignore */
      }
    }
  }
  rulerWin = null
  maskWin = null
  calcWin = null
  createCalcWindow()
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

function placeCalc(browserWindow) {
  const display = screen.getPrimaryDisplay()
  const { width: sw, height: sh, x: wx, y: wy } = display.workArea
  const portraitScreen = sh > sw
  let w
  let h
  if (portraitScreen) {
    // 竖屏显示器 → 9:16 窗口
    h = Math.min(sh - 24, 1280)
    w = Math.round((h * 9) / 16)
    if (w > sw - 24) {
      w = Math.max(420, sw - 24)
      h = Math.min(sh - 24, Math.round((w * 16) / 9))
    }
  } else {
    // 横屏（如 27" 4K 16:9）→ 宽屏窗口，方便常规收看
    w = Math.min(sw - 80, 1480)
    h = Math.min(sh - 60, Math.round((w * 9) / 16) + 80)
    if (h < 720) h = Math.min(sh - 60, 720)
    if (w < 1100) w = Math.min(sw - 40, 1100)
  }
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
  if (!followMouse || !rulerWin || rulerWin.isDestroyed()) return
  const signedDy = invertY ? -dy : dy
  const dPitch = signedDy * degPerCount
  if (dPitch === 0) return
  try {
    rulerWin.webContents.send('desktop:mouse-delta', { dx, dy, dPitch })
  } catch {
    /* window tearing down */
  }
}

function startMouseFollow() {
  if (!rulerWin || rulerWin.isDestroyed()) return { ok: false, reason: '窗口未就绪' }
  const result = rawMouse.start(rulerWin, (_dx, dy) => {
    sendFollowDelta(0, dy)
  })
  followMouse = !!(result && result.ok)
  if (rulerWin && !rulerWin.isDestroyed()) {
    try {
      rulerWin.webContents.send('desktop:follow', {
        active: followMouse,
        ...result,
        degPerCount,
      })
    } catch {
      /* ignore */
    }
  }
  return result
}

function stopMouseFollow() {
  followMouse = false
  rawMouse.stop()
  // closed 事件里窗口已销毁，不能再 send
  if (!rulerWin || rulerWin.isDestroyed()) return
  try {
    rulerWin.webContents.send('desktop:follow', { active: false })
  } catch {
    /* ignore */
  }
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
      sandbox: false,
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

function createMaskWindow() {
  if (maskWin && !maskWin.isDestroyed()) {
    if (maskWin.isMinimized()) maskWin.restore()
    applyMaskLayout()
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
    focusable: true,
    skipTaskbar: true,
    show: false,
    title: 'DF仰角遮罩',
    webPreferences: {
      preload: path.join(__dirname, 'preload-mask.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  maskWin.setAlwaysOnTop(true, 'screen-saver')
  maskWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  applyMaskLayout()
  // 默认点穿；关闭钮区域由页面临时取消 ignore
  maskWin.setIgnoreMouseEvents(true, { forward: true })

  maskWin.once('ready-to-show', () => {
    applyMaskLayout()
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
    height: 800,
    minWidth: 420,
    minHeight: 560,
    frame: true,
    transparent: false,
    backgroundColor: '#0a1018',
    autoHideMenuBar: false,
    show: false,
    title: '定点打击计算器',
    webPreferences: {
      preload: path.join(__dirname, 'preload-shell.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  placeCalc(calcWin)

  calcWin.once('ready-to-show', () => {
    calcWin?.show()
  })

  // 排版由页面按窗口宽高比自动切换横/竖
  loadPage(calcWin, null)

  calcWin.on('closed', () => {
    calcWin = null
  })

  return calcWin
}

function setClickThrough(enabled) {
  clickThrough = enabled
  if (!rulerWin || rulerWin.isDestroyed()) return
  if (enabled) {
    rulerWin.setIgnoreMouseEvents(true, { forward: true })
  } else {
    rulerWin.setIgnoreMouseEvents(false)
  }
  try {
    rulerWin.webContents.send('desktop:click-through', clickThrough)
  } catch {
    /* ignore */
  }
}

function setPassthroughIgnore(ignore) {
  if (!rulerWin || rulerWin.isDestroyed() || !clickThrough) return
  if (ignore) rulerWin.setIgnoreMouseEvents(true, { forward: true })
  else rulerWin.setIgnoreMouseEvents(false)
}

function setSlim(next) {
  slim = !!next
  if (!rulerWin || rulerWin.isDestroyed()) return
  placeLeft(rulerWin)
  try {
    rulerWin.webContents.send('desktop:slim', slim)
  } catch {
    /* ignore */
  }
}

function buildAppMenu() {
  // 侧栏开闭已在计算器顶栏，不再显示「窗口」菜单
  Menu.setApplicationMenu(null)
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

if (gotLock) {
  app.on('second-instance', () => {
    // 再次双击：关掉旧侧栏/旧计算器，只开一个新的计算器
    resetToCalcOnly()
  })

  app.whenReady().then(() => {
    loadMaskLayoutFile()
    buildAppMenu()
    // 启动只开计算器；两种侧栏由顶栏 / 菜单 / 快捷键按需打开
    createCalcWindow()
    registerShortcuts()

    ipcMain.handle('desktop:get-state', () => ({
      clickThrough,
      slim,
      isDev,
      followMouse,
      degPerCount,
      invertY,
      rawSupported: rawMouse.isSupported,
      maskLayout: { ...maskLayout },
    }))
    ipcMain.handle('desktop:get-mask-layout', () => ({ ...maskLayout }))
    ipcMain.on('desktop:set-mask-layout', (_e, partial) => {
      if (!partial || typeof partial !== 'object') return
      if (Number.isFinite(partial.xPercent)) {
        maskLayout.xPercent = Math.min(100, Math.max(0, Number(partial.xPercent)))
      }
      if (Number.isFinite(partial.opacity)) {
        maskLayout.opacity = Math.min(100, Math.max(0, Number(partial.opacity)))
      }
      saveMaskLayoutFile()
      applyMaskLayout()
    })
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
    ipcMain.on('desktop:open-ruler', () => {
      createRulerWindow()
    })
    ipcMain.on('desktop:open-mask', () => {
      createMaskWindow()
    })
    ipcMain.on('desktop:close-mask', () => {
      if (!maskWin || maskWin.isDestroyed()) return
      maskWin.close()
    })
    ipcMain.on('desktop:set-mask-passthrough-ignore', (_e, ignore) => {
      if (!maskWin || maskWin.isDestroyed()) return
      if (ignore) maskWin.setIgnoreMouseEvents(true, { forward: true })
      else maskWin.setIgnoreMouseEvents(false)
    })
    ipcMain.on('desktop:set-follow', (_e, enabled) => {
      if (enabled) startMouseFollow()
      else stopMouseFollow()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createCalcWindow()
    })
  })

  app.on('will-quit', () => {
    stopMouseFollow()
    globalShortcut.unregisterAll()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
