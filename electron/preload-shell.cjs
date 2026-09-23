const { contextBridge, ipcRenderer } = require('electron')

/** 计算器窗口用：只负责按需打开侧栏，不进桌面尺模式 */
contextBridge.exposeInMainWorld('dfApp', {
  isShell: true,
  openRuler: () => ipcRenderer.send('desktop:open-ruler'),
  openMask: () => ipcRenderer.send('desktop:open-mask'),
})
