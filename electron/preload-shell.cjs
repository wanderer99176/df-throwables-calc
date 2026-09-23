const { contextBridge, ipcRenderer } = require('electron')

/** 计算器窗口用：按需打开侧栏 / 调节光学遮罩位置与透明度 */
contextBridge.exposeInMainWorld('dfApp', {
  isShell: true,
  openRuler: () => ipcRenderer.send('desktop:open-ruler'),
  openMask: () => ipcRenderer.send('desktop:open-mask'),
  getMaskLayout: () => ipcRenderer.invoke('desktop:get-mask-layout'),
  setMaskLayout: (partial) => ipcRenderer.send('desktop:set-mask-layout', partial),
})
