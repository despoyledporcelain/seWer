const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron')
const path = require('path')
const fs   = require('fs')
const mm   = require('music-metadata')

let win

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac', '.opus', '.wma'])

function hashColor(str) {
  let h = 0
  for (const c of str) h = ((h << 5) - h + c.charCodeAt(0)) | 0
  const hue = Math.abs(h) % 360
  return `hsl(${hue},52%,40%)`
}

function scanDir(dir) {
  const out = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...scanDir(full))
      else if (AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) out.push(full)
    }
  } catch {}
  return out
}

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) } catch { return {} }
}
function saveSettings(data) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(data, null, 2)) } catch {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'renderer', 'preload.js'),
    },
  })

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

ipcMain.on('win-minimize', () => win.minimize())
ipcMain.on('win-maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.on('win-close',    () => win.close())

ipcMain.handle('dialog-select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Выбрать папку с музыкой',
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('scan-music-folder', async (_, folderPath) => {
  if (!folderPath) return []
  const files = scanDir(folderPath)
  const results = new Array(files.length)
  let next = 0
  async function worker() {
    while (next < files.length) {
      const i = next++
      const p    = files[i]
      const ext  = path.extname(p)
      const base = path.basename(p, ext)
      const parts = base.split(' - ')
      let artist = parts.length >= 2 ? parts[0].trim() : 'Неизвестно'
      let title  = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : base
      let duration = 0
      try {
        const meta = await mm.parseFile(p, { skipCovers: true })
        duration = Math.floor(meta.format.duration || 0)
        if (meta.common.title)  title  = meta.common.title
        if (meta.common.artist) artist = meta.common.artist
      } catch {}
      results[i] = { id: i + 1, title, artist, path: p, color: hashColor(base), duration }
    }
  }
  await Promise.all(Array.from({ length: Math.min(16, files.length) }, worker))
  return results
})

ipcMain.handle('get-cover-art', async (_, filePath) => {
  try {
    const meta = await mm.parseFile(filePath, { skipCovers: false })
    const pic  = meta.common.picture?.[0]
    if (!pic) return null
    return `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`
  } catch { return null }
})

ipcMain.handle('load-settings', () => loadSettings())
ipcMain.handle('save-settings', (_, data) => saveSettings(data))

app.whenReady().then(() => {
  createWindow()
  globalShortcut.register('MediaPlayPause',     () => win?.webContents.send('media-play-pause'))
  globalShortcut.register('MediaNextTrack',     () => win?.webContents.send('media-next'))
  globalShortcut.register('MediaPreviousTrack', () => win?.webContents.send('media-prev'))
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
