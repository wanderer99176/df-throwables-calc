const { contextBridge, ipcRenderer } = require('electron')

/** 光学仰角遮罩：关闭 + 仅关闭钮可点（其余点穿） */
contextBridge.exposeInMainWorld('dfMask', {
  isMask: true,
  close: () => ipcRenderer.send('desktop:close-mask'),
  setPassthroughIgnore: (ignore) =>
    ipcRenderer.send('desktop:set-mask-passthrough-ignore', ignore),
})
