/**
 * Windows Raw Input（RIDEV_INPUTSINK）挂到 Electron 窗口。
 * 不读内存 / 不注入 / 不截屏——只订阅系统原始鼠标相对位移。
 */
const koffi = require('koffi')

const WM_INPUT = 0x00ff
const RIDEV_INPUTSINK = 0x00000100
const RID_INPUT = 0x10000003
const RIM_TYPEMOUSE = 0
const HEADER_SIZE = process.arch === 'ia32' ? 16 : 24

const user32 = koffi.load('user32.dll')
const GetRawInputData = user32.func(
  'uint32 __stdcall GetRawInputData(void *hRawInput, uint32 uiCommand, void *pData, uint32 *pcbSize, uint32 cbSizeHeader)',
)
const RegisterRawInputDevices = user32.func(
  'int __stdcall RegisterRawInputDevices(void *pRawInputDevices, uint32 uiNumDevices, uint32 cbSize)',
)

/** @type {((dx: number, dy: number) => void) | null} */
let onDelta = null
/** @type {import('electron').BrowserWindow | null} */
let hookedWin = null

function lparamToHandle(lParam) {
  if (Buffer.isBuffer(lParam)) {
    return process.arch === 'ia32' ? BigInt(lParam.readUInt32LE(0)) : lParam.readBigUInt64LE(0)
  }
  return BigInt(lParam)
}

function readMouseDelta(hRawInput) {
  const pcbSize = Buffer.alloc(4)
  pcbSize.writeUInt32LE(0, 0)
  GetRawInputData(hRawInput, RID_INPUT, null, pcbSize, HEADER_SIZE)
  const need = pcbSize.readUInt32LE(0)
  if (!need || need > 512) return null

  const data = Buffer.alloc(need)
  pcbSize.writeUInt32LE(need, 0)
  const n = GetRawInputData(hRawInput, RID_INPUT, data, pcbSize, HEADER_SIZE)
  if (n === 0xffffffff) return null
  if (data.readUInt32LE(0) !== RIM_TYPEMOUSE) return null

  return {
    dx: data.readInt32LE(HEADER_SIZE + 12),
    dy: data.readInt32LE(HEADER_SIZE + 16),
  }
}

/**
 * @param {import('electron').BrowserWindow} win
 * @param {(dx: number, dy: number) => void} callback
 */
function start(win, callback) {
  if (process.platform !== 'win32') {
    return { ok: false, reason: '仅 Windows 支持 Raw Input' }
  }

  onDelta = callback
  hookedWin = win

  const hwndBuf = win.getNativeWindowHandle()
  const ridSize = process.arch === 'ia32' ? 12 : 16
  const ridBuf = Buffer.alloc(ridSize)
  ridBuf.writeUInt16LE(0x01, 0)
  ridBuf.writeUInt16LE(0x02, 2)
  ridBuf.writeUInt32LE(RIDEV_INPUTSINK, 4)
  if (process.arch === 'ia32') {
    ridBuf.writeUInt32LE(hwndBuf.readUInt32LE(0), 8)
  } else {
    ridBuf.writeBigUInt64LE(hwndBuf.readBigUInt64LE(0), 8)
  }

  if (!RegisterRawInputDevices(ridBuf, 1, ridSize)) {
    return { ok: false, reason: 'RegisterRawInputDevices 失败' }
  }

  try {
    win.hookWindowMessage(WM_INPUT, (_wParam, lParam) => {
      try {
        const delta = readMouseDelta(lparamToHandle(lParam))
        if (delta && (delta.dx !== 0 || delta.dy !== 0) && onDelta) {
          onDelta(delta.dx, delta.dy)
        }
      } catch {
        /* ignore */
      }
    })
  } catch (e) {
    return { ok: false, reason: String(e) }
  }

  return { ok: true, mode: 'raw-input' }
}

function stop() {
  onDelta = null
  if (hookedWin) {
    try {
      hookedWin.unhookWindowMessage(WM_INPUT)
    } catch {
      /* ignore */
    }
    hookedWin = null
  }
}

module.exports = {
  start,
  stop,
  isSupported: process.platform === 'win32',
}
