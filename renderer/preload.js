const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize:          () => ipcRenderer.send('win-minimize'),
  maximize:          () => ipcRenderer.send('win-maximize'),
  close:             () => ipcRenderer.send('win-close'),
  selectMusicFolder: ()       => ipcRenderer.invoke('dialog-select-folder'),
  scanMusicFolder:   (folder) => ipcRenderer.invoke('scan-music-folder', folder),
  getCoverArt:       (filePath) => ipcRenderer.invoke('get-cover-art', filePath),
  loadSettings:      ()       => ipcRenderer.invoke('load-settings'),
  saveSettings:      (data)   => ipcRenderer.invoke('save-settings', data),
  onMediaPlayPause:  (cb) => ipcRenderer.on('media-play-pause', () => cb()),
  onMediaNext:       (cb) => ipcRenderer.on('media-next',       () => cb()),
  onMediaPrev:       (cb) => ipcRenderer.on('media-prev',       () => cb()),
})
