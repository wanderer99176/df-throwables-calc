const {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  screen,
} = require('electron')
const path = require('path')

/** @type {Electron.BrowserWindow | null} */
let maskWin = null
/** @type {Electron.BrowserWindow | null} */
let calcWin = null

const isDev = !app.isPackaged && process.env.DF_DESKTOP_DEV === '1'
const DEV_URL = process.env.DF_DEV_URL || 'http://127.0.0.1:5173'
const DIST_HTML = path.join(__dirname, '..', 'dist', 'index.html')

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

/** 左侧全高窄条，盖住游戏画面边缘 */
function placeMask(browserWindow) {
  const display = screen.getPrimaryDisplay()
  const { x, y, height } = display.bounds
  const w = 120
  browserWindow.setBounds({
    x: x + 4,
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

/**
 * 纯光学仰角遮罩：全程点穿 + 不可聚焦，不抢游戏鼠标/视角。
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

  // 全程点穿：鼠标事件全部落到游戏，遮罩只负责「看」
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

function buildAppMenu() {
  const template = [
    {
      label: '窗口',
      submenu: [
        {
          label: '打开仰角遮罩',
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
  // 仅显示/隐藏遮罩；不再抢跟随或穿透切换
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (!maskWin || maskWin.isDestroyed()) {
      createMaskWindow()
      return
    }
    if (maskWin.isVisible()) maskWin.hide()
    else maskWin.showInactive()
  })
}

app.whenReady().then(() => {
  buildAppMenu()
  createCalcWindow()
  createMaskWindow()
  registerShortcuts()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createCalcWindow()
      createMaskWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
