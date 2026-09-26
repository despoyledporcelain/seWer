const { app, BrowserWindow, ipcMain, dialog, globalShortcut, nativeImage, Tray, Menu } = require('electron')
const path = require('path')
const fs   = require('fs')
const mm   = require('music-metadata')

// EPIPE guard: writing to stdout without a console (packaged exe) would crash the main process
process.stdout?.on?.('error', e => { if (e.code === 'EPIPE') return; throw e })

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
    height: 700,
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

/* выбор картинки для обложки плейлиста: сразу читаем в data URL,
   renderer дальше сам уменьшает/кропает через canvas */
ipcMain.handle('dialog-select-image', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    title: 'Выбрать обложку',
    filters: [{ name: 'Изображения', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
  })
  if (canceled || !filePaths[0]) return null
  try {
    const buf = fs.readFileSync(filePaths[0])
    if (buf.length > 25 * 1024 * 1024) return null
    const ext = path.extname(filePaths[0]).slice(1).toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg'
    return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, name: path.basename(filePaths[0]) }
  } catch { return null }
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

/* анти-бот DataDome: write-запросы не чаще раза в 1.5с, а после 403/429 —
   минутная пауза на ВСЕ write. иначе SC мягко блокирует сессию */
let scWriteLastAt = 0
let scWriteBlockedUntil = 0

ipcMain.handle('sc-fetch', async (_, url, token, clientId, method = 'GET', body = null, contentType = null) => {
  /* PUT/DELETE/POST — через сессию с DataDome cookie (нужно для
     редактирования/создания плейлистов); остальное — обычный https GET.
     body-строка шлётся как есть (form-encoded), объект — JSON.stringify.
     {__multipart:{fields,file}} — multipart/form-data с файлом (обложка
     плейлиста): тело собираем в Buffer вручную, boundary задаём сами —
     ses.fetch не обязан уметь FormData */
  const isWrite = method === 'PUT' || method === 'DELETE' || method === 'POST'
  /* app_version/app_locale — как у веб-клиента SC (из HAR рабочего PUT) */
  const fullUrl = url.includes('client_id=') ? url
    : `${url}${url.includes('?') ? '&' : '?'}client_id=${encodeURIComponent(clientId)}${isWrite ? '&app_version=1787325861&app_locale=en' : ''}`

  let bodyOut = null
  let ctOut = contentType
  if (body != null) {
    if (body.__multipart) {
      const boundary = '----seWer' + Date.now().toString(36) + Math.random().toString(36).slice(2)
      const parts = []
      for (const f of body.__multipart.fields || [])
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`))
      const file = body.__multipart.file
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename.replace(/["\\]/g, '')}"\r\nContent-Type: ${file.mime}\r\n\r\n`))
      parts.push(Buffer.from(file.b64, 'base64'))
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
      /* Blob, а не Buffer.concat: для бинарного тела fetch берёт Content-Type
         из blob.type, на голом Node-буфере полагаться не стоит.
         ВНИМАНИЕ: обложка плейлиста multipart'ом НЕ грузится — SC ждёт
         json {image_data: base64} на .../artwork (см. saveNow в index.html).
         Эта ветка остаётся на будущее для других файловых загрузок */
      ctOut = `multipart/form-data; boundary=${boundary}`
      bodyOut = new Blob(parts, { type: ctOut })
    } else {
      bodyOut = typeof body === 'string' ? body : JSON.stringify(body)
    }
  }

  if (isWrite) {
    const now = Date.now()
    if (now < scWriteBlockedUntil)
      return { error: 429, body: 'write backoff (после 403/429 ждём минуту)', blocked: true }
    const wait = scWriteLastAt + 1500 - now
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    scWriteLastAt = Date.now()
    try {
      const ses = require('electron').session.fromPartition('persist:soundcloud')
      const cookies = await ses.cookies.get({ url: 'https://soundcloud.com' })
      const datadome = cookies.find(c => c.name === 'datadome')
      const res = await ses.fetch(fullUrl, {
        method,
        headers: {
          'Authorization': `OAuth ${token}`,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          /* Content-Type только с телом: follow/unfollow идут без тела,
             а json-тип без тела SC пытается парсить → 400 (по HAR сайта) */
          ...(bodyOut != null ? { 'Content-Type': ctOut || 'application/json' } : {}),
          'Origin': 'https://soundcloud.com',
          'Referer': 'https://soundcloud.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64.64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
          ...(datadome ? { 'x-datadome-clientid': datadome.value } : {}),
        },
        ...(bodyOut != null ? { body: bodyOut } : {}),
      })
      const text = await res.text()
      if (res.status === 403 || res.status === 429) {
        scWriteBlockedUntil = Date.now() + 60_000
        return { error: res.status, body: text.slice(0, 600), blocked: true, sentCT: ctOut || null, sentURL: fullUrl }
      }
      if (res.status !== 200 && res.status !== 201 && res.status !== 204)
        return { error: res.status, body: text.slice(0, 600), sentCT: ctOut || null, sentURL: fullUrl }
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


/* ─── скачивание трека ─────────────────────────────────────────────────────
   Отдельный путь от sc-fetch: тот читает тело через res.text() и для
   бинарника в 10МБ это снесло бы память и испортило файл. Здесь поток
   пишется на диск по кускам, с прогрессом в рендерер.

   Поддерживается только progressive-transcoding (обычный mp3). Для треков,
   у которых SC отдаёт лишь hls, нужен ffmpeg — его в проекте нет, поэтому
   такие честно отвечают ошибкой, а не молча пишут мусор. */
const DL_REDIRECT_LIMIT = 5

/* Windows не любит эти символы и зарезервированные имена */
const ILLEGAL_NAME = /[<>:"/\\|?*\x00-\x1f]/g
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

function sanitizeFileName(name) {
  let s = String(name || 'track').replace(ILLEGAL_NAME, '_')
  s = s.replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim()   /* хвостовые точки и пробелы */
  if (!s) s = 'track'
  if (RESERVED_NAME.test(s)) s = '_' + s
  if (s.length > 140) s = s.slice(0, 140).replace(/[. ]+$/, '')
  return s
}

/* не перезаписываем: Artist - Song.mp3 → Artist - Song (2).mp3 */
function uniquePath(dir, base, ext) {
  let p = path.join(dir, base + ext)
  let n = 2
  while (fs.existsSync(p)) {
    p = path.join(dir, `${base} (${n})` + ext)
    n++
    if (n > 999) break
  }
  return p
}

const sendProgress = payload => { try { win?.webContents.send('download-progress', payload) } catch {} }

/* ГЛАВНОЕ, что здесь есть: проверка, что пришло АУДИО, а не мусор.
   mp3 начинается либо с 'ID3' (id3v2-заголовок), либо с кадра MPEG —
   байт 0xFF и следующий с 0xE0-битным вторым битом (0xE0 маска: 111xxxxx).
   Всё остальное — не mp3: '{' — json-манифест (именно это приходило раньше:
   streamUrl отдаёт json, а не звук, и он молча писался как .mp3 на 1кб),
   '#' — m3u8-манифест. Ловим это ДО записи на диск. */
function looksLikeAudio(buf) {
  if (!buf || buf.length < 2) return false
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true          /* ID3 */
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true                    /* MPEG sync */
  /* некоторым старым сборкам mp2/id3 без заголовка помогает RIFF/ADTS — не ловим,
     лучше честно откажемся, чем запишем мусор */
  return false
}
const badPayload = head => {
  const c = head[0]
  if (c === 0x7b || c === 0x5b) return 'not_audio_json'          /* { или [ */
  if (c === 0x23) return 'not_audio_m3u8'                        /* # */
  if (c === 0x3c) return 'not_audio_html'                         /* < */
  return 'not_audio'
}

/* GET с редиректами, тело пишется в dest. отдаёт { total, sniffed } */
function downloadToFile(url, dest, token, onProgress) {
  return new Promise((resolve, reject) => {
    let hops = 0
    const attempt = (currentUrl, currentToken) => {
      const u = new URL(currentUrl)
      const mod = u.protocol === 'http:' ? require('http') : require('https')
      const req = mod.get({
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
          'Accept': 'audio/*,*/*;q=0.8',
          ...(currentToken ? { 'Authorization': `OAuth ${currentToken}` } : {}),
        },
      }, res => {
        const code = res.statusCode || 0
        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
          res.resume()
          if (++hops > DL_REDIRECT_LIMIT) { reject(new Error('too many redirects')); return }
          const next = new URL(res.headers.location, currentUrl).toString()
          /* на CDN токен не нужен и иногда мешает — рвём его на другом хосте */
          const sameHost = new URL(next).hostname === u.hostname
          attempt(next, sameHost ? currentToken : null)
          return
        }
        if (code !== 200) { res.resume(); reject(new Error('HTTP ' + code)); return }
        const total = Number(res.headers['content-length']) || 0
        const out = fs.createWriteStream(dest)
        let got = 0
        let head = null
        let sniffErr = null
        const fail = msg => {
          res.destroy()
          out.destroy()
          try { fs.unlinkSync(dest) } catch {}
          reject(new Error(msg))
        }
        /* pipe ПЕРВЫМ: он вешает свой обработчик и берёт на себя backpressure.
           наш счётчик — только наблюдатель, и после pipe он уже не может
           сорвать поток в flowing-режим раньше, чем появится получатель */
        res.pipe(out)
        res.on('data', c => {
          got += c.length
          /* первые 3 байта решают, аудио это или нет. рвём поток сразу,
             не дописывая мусор до конца */
          if (!head && got >= 3) { head = Buffer.from(c.subarray(0, 3)); if (!looksLikeAudio(head)) { sniffErr = badPayload(head); fail(sniffErr) } }
          onProgress(got, total)
        })
        out.on('finish', () => {
          if (sniffErr) return
          if (!head && got > 0) {   /* файл короче 3 байт — точно не mp3 */
            try { fs.unlinkSync(dest) } catch {}
            reject(new Error('too_small')); return
          }
          resolve({ total })
        })
        out.on('error', e => { res.destroy(); reject(e) })
        res.on('error', e => { if (!sniffErr) { out.destroy(); reject(e) } })
      })
      req.on('error', e => reject(e))
      req.setTimeout(45000, () => { req.destroy(new Error('timeout')) })
    }
    attempt(url, token)
  })
}

/* обложка в APIC: bytes, не путь. молча переживаем ошибку — теги важнее картинки */
async function fetchCoverBuffer(url) {
  if (!url) return null
  return new Promise(resolve => {
    let hops = 0
    const attempt = u => {
      const parsed = new URL(u)
      require('https').get({
        hostname: parsed.hostname, path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume()
          if (++hops > 4) { resolve(null); return }
          attempt(new URL(res.headers.location, u).toString()); return
        }
        if (res.statusCode !== 200) { res.resume(); resolve(null); return }
        const parts = []
        res.on('data', c => parts.push(c))
        res.on('end', () => { const b = Buffer.concat(parts); resolve(b.length ? b : null) })
        res.on('error', () => resolve(null))
      }).on('error', () => resolve(null))
    }
    try { attempt(url) } catch { resolve(null) }
  })
}

/* streamUrl СЮДА ПРИХОДИТ УЖЕ РЕЗОЛВНУТЫМ (renderer вызывает scFetch и берёт
   .data.url). сам api-v2 /media/.../stream/progressive отдаёт JSON-манифест, а
   не звук — раньше он писался на диск как .mp3 и давал файл на 1кб. client_id
   тоже НЕ дописывается: у CDN-ссылки он уже сидит в policy-параметрах, и хвост
   после подписи ломает валидацию. */
ipcMain.handle('sc-download-track', async (_, t) => {
  const { id, title, artist, album, comment, coverUrl, streamUrl, dir, token, trackNo } = t || {}
  if (!dir) return { error: 'no_dir' }
  if (!streamUrl) return { error: 'no_progressive' }   /* hls-only: нужен ffmpeg */
  fs.mkdirSync(dir, { recursive: true })

  const base = sanitizeFileName(t.baseName || `${artist ? artist + ' - ' : ''}${title}`)
  const finalPath = uniquePath(dir, base, '.mp3')
  const tmp = finalPath + '.tmp'

  let res
  try {
    res = await downloadToFile(streamUrl, tmp, token,
      (got, total) => sendProgress({ id, got, total }))
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch {}
    return { error: String(e.message || e) }
  }

  /* тэги: сбой записи НЕ отменяет сам файл — mp3 уже лежит на диске, но
     пользователь обязан узнать, что файл без обложки/тегов, иначе это
     выглядит как «приложение забыло» */
  let tagsOk = false
  try {
    const NodeID3 = require('node-id3')
    const tags = {
      title: title || '',
      artist: artist || '',
      ...(album ? { album } : {}),
      ...(comment ? { comment } : {}),
      ...(trackNo ? { track: String(trackNo) } : {}),
    }
    const cover = await fetchCoverBuffer(coverUrl)
    if (cover) tags.image = cover
    await NodeID3.write(tmp, tags)
    tagsOk = true
  } catch (e) {
    sendProgress({ id, warn: 'tags_failed: ' + String(e.message || e) })
  }

  try { fs.renameSync(tmp, finalPath) } catch (e) {
    return { error: 'rename: ' + String(e.message || e) }
  }

  sendProgress({ id, done: true, path: finalPath })
  return { path: finalPath, size: res?.total || 0, tagsOk }
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
