const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dfDesktop', {
  isDesktop: true,
  getState: () => ipcRenderer.invoke('desktop:get-state'),
  setClickThrough: (enabled) => ipcRenderer.send('desktop:set-click-through', enabled),
  setPassthroughIgnore: (ignore) =>
    ipcRenderer.send('desktop:set-passthrough-ignore', ignore),
  setSlim: (enabled) => ipcRenderer.send('desktop:set-slim', enabled),
  close: () => ipcRenderer.send('desktop:close'),
  openCalc: () => ipcRenderer.send('desktop:open-calc'),
  openMask: () => ipcRenderer.send('desktop:open-mask'),
  setFollow: (enabled) => ipcRenderer.send('desktop:set-follow', enabled),
  onClickThrough: (cb) => {
    ipcRenderer.on('desktop:click-through', (_e, v) => cb(v))
  },
  onSlim: (cb) => {
    ipcRenderer.on('desktop:slim', (_e, v) => cb(v))
  },
  onMouseDelta: (cb) => {
    ipcRenderer.on('desktop:mouse-delta', (_e, v) => cb(v))
  },
  onFollow: (cb) => {
    ipcRenderer.on('desktop:follow', (_e, v) => cb(v))
  },
  onPitchZero: (cb) => {
    ipcRenderer.on('desktop:pitch-zero', () => cb())
  },
})
