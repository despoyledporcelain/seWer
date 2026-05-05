const { app, BrowserWindow, ipcMain, dialog, globalShortcut, nativeImage } = require('electron')
const path = require('path')
const fs   = require('fs')
const mm   = require('music-metadata')

let win

// Discord RPC
let discordClient = null
let discordReady  = false

async function initDiscord() {
  try {
    const { Client } = await import('@xhayper/discord-rpc')
    discordClient = new Client({ clientId: '1501214545136586792' })
    discordClient.on('ready',        () => { discordReady = true })
    discordClient.on('disconnected', () => { discordReady = false })
    await discordClient.login()
  } catch {}
}

ipcMain.handle('discord-update', async (_, data) => {
  if (!discordReady || !discordClient?.user) return
  try {
    const activity = {
      type: 2,
      details: String(data.title  || '').slice(0, 128),
      state:   String(data.artist || '').slice(0, 128),
    }
    if (data.coverUrl?.startsWith('https://')) {
      activity.largeImageKey = data.coverUrl
    }
    if (data.isPlaying && data.duration > 0) {
      const elapsed = Math.max(0, data.progress) * data.duration * 1000
      const now = Date.now()
      activity.startTimestamp = Math.floor(now - elapsed)
      activity.endTimestamp   = Math.floor(now - elapsed + data.duration * 1000)
    }
    await discordClient.user.setActivity(activity)
  } catch {}
})

ipcMain.handle('discord-clear', async () => {
  if (!discordReady || !discordClient?.user) return
  try { await discordClient.user.clearActivity() } catch {}
})

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
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))

  win = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: true,
    icon,
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

ipcMain.handle('scan-music-folder', async (_, folderPath, minDuration = 30) => {
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
      if (duration < minDuration) { results[i] = null; return }
      results[i] = { id: i + 1, title, artist, path: p, color: hashColor(base), duration }
    }
  }
  await Promise.all(Array.from({ length: Math.min(16, files.length) }, worker))
  return results.filter(Boolean)
})

ipcMain.handle('get-cover-art', async (_, filePath) => {
  try {
    const meta = await mm.parseFile(filePath, { skipCovers: false })
    const pic  = meta.common.picture?.[0]
    if (!pic) return null
    return `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`
  } catch { return null }
})

const scCoversDir = () => path.join(app.getPath('userData'), 'sc_covers')

ipcMain.handle('sc-check-covers', (_, ids) => {
  const dir = scCoversDir()
  const result = {}
  for (const id of ids) {
    const file = path.join(dir, `${id}.jpg`)
    if (fs.existsSync(file)) result[id] = 'file:///' + file.replace(/\\/g, '/')
  }
  return result
})

ipcMain.handle('sc-cache-cover', (_, id, url) => new Promise((resolve) => {
  const dir = scCoversDir()
  const file = path.join(dir, `${id}.jpg`)
  if (fs.existsSync(file)) { resolve('file:///' + file.replace(/\\/g, '/')); return }
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  const dest = fs.createWriteStream(file)
  require('https').get(url, (res) => {
    if (res.statusCode !== 200) { dest.destroy(); fs.unlink(file, () => {}); resolve(null); return }
    res.pipe(dest)
    dest.on('finish', () => resolve('file:///' + file.replace(/\\/g, '/')))
    dest.on('error', () => { fs.unlink(file, () => {}); resolve(null) })
  }).on('error', () => { dest.destroy(); fs.unlink(file, () => {}); resolve(null) })
}))

ipcMain.handle('load-settings', () => loadSettings())
ipcMain.handle('save-settings', (_, data) => saveSettings(data))

const scLikesFile = () => path.join(app.getPath('userData'), 'sc_likes.json')

ipcMain.handle('sc-load-likes-cache', () => {
  try { return JSON.parse(fs.readFileSync(scLikesFile(), 'utf8')) } catch { return [] }
})
ipcMain.handle('sc-save-likes-cache', (_, data) => {
  try { fs.writeFileSync(scLikesFile(), JSON.stringify(data)) } catch {}
})

ipcMain.handle('sc-login', () => new Promise((resolve) => {
  const authWin = new BrowserWindow({
    width: 900, height: 700,
    parent: win,
    webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:soundcloud' },
  })

  let token = null, clientId = null, resolved = false
  const ses = authWin.webContents.session

  ses.webRequest.onBeforeSendHeaders({ urls: ['*://api-v2.soundcloud.com/*'] }, (details, callback) => {
    callback({ requestHeaders: details.requestHeaders })

    const auth = details.requestHeaders['Authorization']
    if (auth && auth.startsWith('OAuth ')) token = auth.slice(6)
    try {
      const cid = new URL(details.url).searchParams.get('client_id')
      if (cid) clientId = cid
    } catch {}

    if (token && clientId && !resolved) {
      resolved = true
      ses.webRequest.onBeforeSendHeaders(null)
      resolve({ token, clientId })
      setImmediate(() => authWin.close())
    }
  })

  authWin.loadURL('https://soundcloud.com')
  authWin.on('closed', () => { if (!resolved) resolve(null) })
}))

ipcMain.handle('sc-fetch', (_, url, token, clientId) => new Promise((resolve) => {
  const fullUrl = url.includes('client_id=') ? url
    : `${url}${url.includes('?') ? '&' : '?'}client_id=${encodeURIComponent(clientId)}`
  const parsed = new URL(fullUrl)
  const req = require('https').request({
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      'Authorization': `OAuth ${token}`,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
  }, (res) => {
    let raw = ''
    res.on('data', c => raw += c)
    res.on('end', () => {
      if (res.statusCode !== 200) { resolve({ error: res.statusCode }); return }
      try { resolve({ data: JSON.parse(raw) }) }
      catch { resolve({ error: 'parse_error' }) }
    })
  })
  req.on('error', e => resolve({ error: String(e) }))
  req.end()
}))

app.whenReady().then(() => {
  createWindow()
  initDiscord()
  globalShortcut.register('MediaPlayPause',     () => win?.webContents.send('media-play-pause'))
  globalShortcut.register('MediaNextTrack',     () => win?.webContents.send('media-next'))
  globalShortcut.register('MediaPreviousTrack', () => win?.webContents.send('media-prev'))
})

app.once('before-quit', async (event) => {
  event.preventDefault()
  globalShortcut.unregisterAll()
  try {
    if (discordReady && discordClient?.user) await discordClient.user.clearActivity()
    if (discordClient) await discordClient.destroy()
  } catch {}
  app.exit(0)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
