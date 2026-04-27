const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')

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

ipcMain.handle('scan-music-folder', (_, folderPath) => {
  if (!folderPath) return []
  return scanDir(folderPath).map((p, i) => {
    const ext   = path.extname(p)
    const base  = path.basename(p, ext)
    const parts = base.split(' - ')
    const artist = parts.length >= 2 ? parts[0].trim() : 'Неизвестно'
    const title  = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : base
    return { id: i + 1, title, artist, path: p, color: hashColor(base), duration: 0 }
  })
})

ipcMain.handle('load-settings', () => loadSettings())
ipcMain.handle('save-settings', (_, data) => saveSettings(data))

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
