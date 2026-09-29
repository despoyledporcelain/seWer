const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize:          () => ipcRenderer.send('win-minimize'),
  maximize:          () => ipcRenderer.send('win-maximize'),
  close:             () => ipcRenderer.send('win-close'),
  selectMusicFolder: ()       => ipcRenderer.invoke('dialog-select-folder'),
  scanMusicFolder:   (folder, minDuration) => ipcRenderer.invoke('scan-music-folder', folder, minDuration),
  getCoverArt:       (filePath) => ipcRenderer.invoke('get-cover-art', filePath),
  selectImage:       ()        => ipcRenderer.invoke('dialog-select-image'),
  loadSettings:      ()       => ipcRenderer.invoke('load-settings'),
  saveSettings:      (data)   => ipcRenderer.invoke('save-settings', data),
  onMediaPlayPause:  (cb) => ipcRenderer.on('media-play-pause', () => cb()),
  onMediaNext:       (cb) => ipcRenderer.on('media-next',       () => cb()),
  onMediaPrev:       (cb) => ipcRenderer.on('media-prev',       () => cb()),
  scLogin:        () => ipcRenderer.invoke('sc-login'),
  scFetch:        (url, token, clientId, method, body, contentType) => ipcRenderer.invoke('sc-fetch', url, token, clientId, method, body, contentType),
  netFetch:       (url, headers) => ipcRenderer.invoke('net-fetch', url, headers),
  scCheckCovers:  (ids) => ipcRenderer.invoke('sc-check-covers', ids),
  scCacheCover:   (id, url) => ipcRenderer.invoke('sc-cache-cover', id, url),
  scClearCoversCache: () => ipcRenderer.invoke('sc-clear-covers-cache'),
  scClearLikesCache:  () => ipcRenderer.invoke('sc-clear-likes-cache'),
  scLoadLikesCache: ()   => ipcRenderer.invoke('sc-load-likes-cache'),
  scSaveLikesCache: (data) => ipcRenderer.invoke('sc-save-likes-cache', data),
  scDownloadTrack:   (t)    => ipcRenderer.invoke('sc-download-track', t),
  /* возвращает отписку: обёртка нужна, иначе removeListener не найдёт
     исходный cb и слушатели накапливаются на каждом открытии диалога */
  onDownloadProgress: (cb)  => {
    const fn = (_e, p) => cb(p);
    ipcRenderer.on('download-progress', fn);
    return () => ipcRenderer.removeListener('download-progress', fn);
  },
  discordUpdate:    (data) => ipcRenderer.invoke('discord-update', data),
  discordClear:     ()     => ipcRenderer.invoke('discord-clear'),
  /* решение на подключение, а не просто обновление присутствия: main держит
     сокет открытым ровно пока тумблер включён (send, не invoke — ответ не нужен) */
  discordSetEnabled: (on)  => ipcRenderer.send('discord-rpc-enabled', !!on),
  onDiscordStatus:   (cb) => {
    const fn = (_e, s) => cb(s);
    ipcRenderer.on('discord-status', fn);
    return () => ipcRenderer.removeListener('discord-status', fn);
  },
  setLoginItem:     (enable) => ipcRenderer.invoke('set-login-item', enable),
})
