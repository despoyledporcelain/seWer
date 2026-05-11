const { app, BrowserWindow, ipcMain, dialog, globalShortcut, nativeImage, Tray, Menu } = require('electron')
const path = require('path')
const fs   = require('fs')
const mm   = require('music-metadata')

let win
let tray = null

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

ipcMain.handle('set-login-item', (_, enable) => {
  app.setLoginItemSettings({ openAtLogin: !!enable, name: 'seWer' })
})

ipcMain.handle('discord-update', async (_, data) => {
  if (!discordReady || !discordClient?.user) return
  try {
    const details = String(data.title  || '').slice(0, 128).padEnd(2, ' ')
    const state   = String(data.artist || '').slice(0, 128).padEnd(2, ' ')
    const activity = {
      type: 2,
      details,
      state,
    }
    if (data.coverUrl?.startsWith('https://')) {
      activity.largeImageKey = data.coverUrl
    }
    if (data.isPlaying && data.duration > 0 && (data.timestamp || 'progress') !== 'none') {
      const elapsed = Math.max(0, data.progress) * data.duration * 1000
      const now = Date.now()
      const ts = data.timestamp || 'progress'
      if (ts === 'progress') {
        activity.startTimestamp = Math.floor(now - elapsed)
        activity.endTimestamp   = Math.floor(now - elapsed + data.duration * 1000)
      } else {
        activity.startTimestamp = Math.floor(now - elapsed)
      }
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

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))
  tray = new Tray(icon)
  tray.setToolTip('seWer')
  tray.on('double-click', () => { win.show(); win.focus() })
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть', click: () => { win.show(); win.focus() } },
    { type: 'separator' },
    { label: 'Выйти', click: () => app.quit() },
  ]))
}

ipcMain.on('win-minimize', () => win.minimize())
ipcMain.on('win-maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.on('win-close', () => {
  const settings = loadSettings()
  if (settings.minimizeToTray) {
    win.hide()
  } else {
    win.close()
  }
})

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
  let existing
  try { existing = new Set(fs.readdirSync(dir)) } catch { existing = new Set() }
  const result = {}
  for (const id of ids) {
    if (existing.has(`${id}.jpg`)) result[id] = 'file:///' + path.join(dir, `${id}.jpg`).replace(/\\/g, '/')
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

ipcMain.handle('sc-clear-covers-cache', () => {
  const dir = scCoversDir()
  try {
    const files = fs.readdirSync(dir)
    for (const f of files) fs.unlinkSync(path.join(dir, f))
    return files.length
  } catch { return 0 }
})

ipcMain.handle('sc-clear-likes-cache', () => {
  try { fs.unlinkSync(scLikesFile()); return true } catch { return false }
})

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

  authWin.loadURL('https://soundcloud.com/signin')
  authWin.on('closed', () => { if (!resolved) resolve(null) })
}))

ipcMain.handle('sc-fetch', async (_, url, token, clientId, method = 'GET') => {
  const isWrite = method === 'PUT' || method === 'DELETE'
  const fullUrl = url.includes('client_id=') ? url
    : `${url}${url.includes('?') ? '&' : '?'}client_id=${encodeURIComponent(clientId)}${isWrite ? '&app_locale=en' : ''}`

  if (isWrite) {
    try {
      const ses = require('electron').session.fromPartition('persist:soundcloud')
      const cookies = await ses.cookies.get({ url: 'https://soundcloud.com' })
      const datadome = cookies.find(c => c.name === 'datadome')
      const res = await ses.fetch(fullUrl, {
        method,
        headers: {
          'Authorization': `OAuth ${token}`,
          'Accept': 'application/json, text/javascript, */*; q=0.1',
          'Origin': 'https://soundcloud.com',
          'Referer': 'https://soundcloud.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
          ...(datadome ? { 'x-datadome-clientid': datadome.value } : {}),
        },
      })
      const text = await res.text()
      if (res.status !== 200 && res.status !== 201 && res.status !== 204) return { error: res.status }
      if (!text.trim()) return { data: null }
      try { return { data: JSON.parse(text) } } catch { return { error: 'parse_error' } }
    } catch (e) { return { error: String(e) } }
  }

  return new Promise((resolve) => {
  const parsed = new URL(fullUrl)
  const req = require('https').request({
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method,
    headers: {
      'Authorization': `OAuth ${token}`,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      'Content-Length': 0,
    },
  }, (res) => {
    let raw = ''
    res.on('data', c => raw += c)
    res.on('end', () => {
      if (res.statusCode !== 200 && res.statusCode !== 201 && res.statusCode !== 204) {
        resolve({ error: res.statusCode }); return
      }
      if (!raw.trim()) { resolve({ data: null }); return }
      try { resolve({ data: JSON.parse(raw) }) }
      catch { resolve({ error: 'parse_error' }) }
    })
  })
  req.on('error', e => resolve({ error: String(e) }))
  req.end()
  })
})

app.whenReady().then(() => {
  createWindow()
  createTray()
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
