const { app, BrowserWindow, ipcMain, dialog, globalShortcut, nativeImage, Tray, Menu } = require('electron')
const path = require('path')
const fs   = require('fs')
const mm   = require('music-metadata')

// EPIPE guard: writing to stdout without a console (packaged exe) would crash the main process
process.stdout?.on?.('error', e => { if (e.code === 'EPIPE') return; throw e })

let win
let tray = null

// Discord RPC
//
// присутствие собирает renderer и отдаёт сюда готовым payload'ом; здесь
// только транспорт. состояние хранится явно, потому что ТРИ независимые
// вещи могут быть не готовы в разное время: сокет, handshake ('ready')
// и сам ответ SET_ACTIVITY.

const RPC_CLIENT_ID   = '1501214545136586792'
const RPC_APP_NAME    = 'seWer'
/* дискорд держит ~300 активных ассетов на приложение (docs: «Up to 300
   custom assets»), и загруженные не исчезают — поэтому потолок на
   сессию, а не «грузим каждый трек заново» */
const RPC_ASSET_LIMIT = 250

let discordClient   = null
let discordReady    = false
let discordWanted   = false
let discordConnecting = false
let discordRetryTimer  = null
let discordRetryDelay  = 1500
/* последняя activity: переживает и неготовый сокет, и очередь */
let discordQueued   = null
let discordBusy     = false
/* cache обложек: coverKey → 'external:…'. локальные треки дают data-url,
   который дискорд не берёт — его надо один раз загрузить */
const rpcAssets     = new Map()
const rpcUploading  = new Map()

function discordStatus(s) {
  try { win?.webContents.send('discord-status', s) } catch {}
}

/* Client.request() резолвится ТОЛЬКО по ответу с совпавшим nonce — таймаута
   в библиотеке нет. без этой обёртки зависший дискорд (а pipe полуоткрыт)
   держал before-quit вечно, а он с preventDefault — то есть приложение
   вообще не закрывалось ни через трей, ни через крестик */
function withTimeout(p, ms) {
  return Promise.race([
    Promise.resolve(p).catch(() => undefined),
    new Promise(r => { const t = setTimeout(r, ms); t.unref?.() }),
  ])
}

function scheduleDiscordReconnect() {
  if (!discordWanted || discordRetryTimer) return
  discordRetryTimer = setTimeout(() => {
    discordRetryTimer = null
    connectDiscord()
  }, discordRetryDelay)
  discordRetryDelay = Math.min(discordRetryDelay * 2, 30000)
}

/* снос клиента без его собственных слушателей: destroy() сам эмитит
   'disconnected', и на обычном переподключении ui мигал бы «соединение
   потеряно» за 200мс до «подключение» */
async function teardownDiscordClient() {
  const c = discordClient
  discordClient = null
  if (!c) return
  try { c.removeAllListeners?.() } catch {}
  await withTimeout(c.user?.clearActivity(), 1500)
  await withTimeout(c.destroy(), 1500)
}

async function connectDiscord() {
  if (discordConnecting || discordReady || !discordWanted) return
  discordConnecting = true
  discordStatus('connecting')
  try {
    const { Client } = await import('@xhayper/discord-rpc')
    await teardownDiscordClient()
    discordClient = new Client({ clientId: RPC_CLIENT_ID })
    discordClient.on('ready', () => {
      discordReady = true
      discordRetryDelay = 1500
      discordStatus('connected')
      /* присутствие, ушедшее до handshake, не выбрасываем — иначе первый
         же трек (тем более при autoplay) не показывался до следующего
         изменения состояния */
      if (discordQueued) { const q = discordQueued; discordQueued = null; discordPush(q) }
    })
    /* рестарт дискорда / сон ноутбука / сеть. раньше здесь просто ставился
       флаг и rpc мёрт до перезапуска приложения */
    discordClient.on('disconnected', () => {
      discordReady = false
      discordStatus('disconnected')
      scheduleDiscordReconnect()
    })
    /* сырой hex каждого фрейма в консоль — мусор. включается только явно */
    if (process.env.SEWER_RPC_DEBUG) discordClient.on('debug', m => console.log('[discord]', m))
    await discordClient.login()
  } catch (e) {
    discordReady = false
    discordStatus('disconnected')
    console.warn('[discord] login failed:', e?.message || e)
    scheduleDiscordReconnect()
  } finally {
    discordConnecting = false
  }
}

async function disconnectDiscord() {
  if (discordRetryTimer) { clearTimeout(discordRetryTimer); discordRetryTimer = null }
  discordReady  = false
  discordQueued = null
  discordStatus('off')
  await teardownDiscordClient()
}

ipcMain.on('discord-rpc-enabled', (_, on) => {
  const want = !!on
  if (want === discordWanted) return
  discordWanted = want
  if (want) connectDiscord()
  else disconnectDiscord()
})

ipcMain.handle('set-login-item', (_, enable) => {
  app.setLoginItemSettings({ openAtLogin: !!enable, name: 'seWer' })
})

function dataUrlToBuffer(dataUrl) {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  const head = dataUrl.slice(5, comma)            /* 'image/jpeg;base64' */
  if (!head.includes('base64')) return null
  return { buf: Buffer.from(dataUrl.slice(comma + 1), 'base64'), mime: head.split(';')[0] }
}

/* обложка → ключ для assets.large_image.
   https — поддерживаемый путь, дискорд тянет её сам.
   data-url (локальные файлы) приходится загружать: RPC-команда
   INITIATE_IMAGE_UPLOAD в библиотеке помечена как недокументированная, так
   что на любом сбое возвращаем null — это ровно то же поведение, что было
   до поддержки локальных обложек (просто нет картинки) */
async function rpcAssetKey(coverUrl, coverKey) {
  if (!coverUrl) return null
  if (coverUrl.startsWith('https://')) return coverUrl
  if (!coverUrl.startsWith('data:image') || !coverKey) return null
  if (!discordReady || !discordClient?.user) return null
  if (rpcAssets.has(coverKey)) return rpcAssets.get(coverKey)
  if (rpcAssets.size >= RPC_ASSET_LIMIT) return null
  if (rpcUploading.has(coverKey)) return rpcUploading.get(coverKey)

  const job = (async () => {
    const parsed = dataUrlToBuffer(coverUrl)
    if (!parsed?.buf.length) return null
    const res = await withTimeout(discordClient.user.initiateImageUpload(), 8000)
    const url     = res?.upload_url
    const remote  = res?.upload_filename
    if (!url || !remote) { console.warn('[discord] asset: unexpected upload shape', res); return null }
    const put = (body, headers) => fetch(url, { method: 'POST', headers, body })
    /* сперва сырые байты, при не-2xx — multipart (так делает discord-rich-presence) */
    let r = await withTimeout(put(parsed.buf, { 'Content-Type': parsed.mime }), 15000)
    if (!r?.ok) {
      const fd = new FormData()
      fd.append('payload_json', JSON.stringify({ name: 'seWer-cover' }))
      fd.append('file', new Blob([parsed.buf], { type: parsed.mime }), `${coverKey}.jpg`)
      r = await withTimeout(fetch(url, { method: 'POST', body: fd }), 15000)
    }
    if (!r?.ok) { console.warn('[discord] asset upload failed:', r?.status); return null }
    const key = 'external:' + remote
    rpcAssets.set(coverKey, key)
    return key
  })().catch(e => { console.warn('[discord] asset:', e?.message || e); return null })
                .finally(() => rpcUploading.delete(coverKey))

  rpcUploading.set(coverKey, job)
  return job
}

function buildActivity(d, largeImageKey) {
  const title  = String(d.title  || '').trim()
  const artist = String(d.artist || '').trim()
  const dur = Number(d.duration) || 0
  const pr  = Number.isFinite(d.progress) ? Math.max(0, d.progress) : 0
  const ts  = d.timestamp || 'progress'

  const activity = {
    /* type 2 = Listening: заголовок присутствия — «Слушает <name>».
       раньше name не передавался вовсе, и дискорд подставлял имя
       зарегистрированного приложения — отсюда «Слушает SoundCloud».
       Spotify-вариант «Слушает <артист>» = name: artist */
    type: 2,
    name:    (artist || title || RPC_APP_NAME).slice(0, 128).padEnd(2, ' '),
    details: title.slice(0, 128).padEnd(2, ' '),
  }
  if (largeImageKey) {
    activity.largeImageKey = largeImageKey
  }
  /* ТОЛЬКО на PLAYING, и это не «оптимизация»:
     discord считает прошедшее как Date.now() - start КАЖДУЮ секунду, на
     своей стороне. заморозить таймер на паузе нельзя — только убрать. со
     startTimestamp на паузе цифра продолжала бы тикать мимо музыки.
     режим 'none' убирает таймер и на игре — остаётся одно название трека. */
  if (d.isPlaying && dur > 0 && ts !== 'none') {
    const start = Math.floor(Date.now() - pr * dur * 1000)
    activity.startTimestamp = start
    if (ts === 'progress') {
      activity.endTimestamp = Math.floor(start + dur * 1000)
    }
  }
  return activity
}

/* сериализованная отправка: setActivity и загрузка обложки — await'ы, и без
   флага два быстрых изменения состояния давали бы две параллельные
   setActivity, где побеждает не та, что последняя */
function discordPush(data) {
  if (!discordWanted) return
  discordQueued = data
  if (discordBusy) return
  discordBusy = true
  ;(async () => {
    try {
      while (discordQueued) {
        const d = discordQueued
        discordQueued = null
        if (!discordReady || !discordClient?.user) { discordQueued = d; break }
        try {
          const key = await rpcAssetKey(d.coverUrl, d.coverKey)
          /* пока грузили обложку, мог прийти свежий payload — старый не шлём */
          if (discordQueued) continue
          const act = buildActivity(d, key)
          await discordClient.user.setActivity(act)
        } catch (e) {
          console.warn('[discord] setActivity:', e?.message || e)
        }
      }
    } finally {
      discordBusy = false
    }
  })()
}

ipcMain.handle('discord-update', async (_, data) => {
  if (!discordWanted || !data) return
  discordPush({
    title:     data.title,
    artist:    data.artist,
    duration:  Number(data.duration) || 0,
    progress:  data.progress,
    coverUrl:  String(data.coverUrl || ''),
    coverKey:  String(data.coverKey || ''),
    isPlaying: !!data.isPlaying,
    timestamp: data.timestamp,
  })
})

ipcMain.handle('discord-clear', async () => {
  discordQueued = null
  if (!discordReady || !discordClient?.user) return
  await withTimeout(discordClient.user.clearActivity(), 2000)
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
      /* ⚠️ НЕОБХОДИМО, иначе анимации в фоне встают колом.
         по умолчанию Electron true: когда окно свёрнуто или полностью
         перекрыто, Chromium душит rAF до ~1Гц. наш рендер целиком
         построен на requestAnimationFrame — hero-клон на GSAP, бегунок
         громкости, пульс лайка, лерп акцента. всё это замирает, а
         ProgressBar дополнительно «откатывается» при возврате в окно,
         потому что он читает позицию по кадрам, а не по времени. */
      backgroundThrottling: false,
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

/* Жалоба на неправильный текст песни — пишется ЛОКАЛЬНО, в userData.
   Смысл: пользователь видит, что текст не тот, жмёт кнопку, и получает
   готовый разбор (что искали, какими запросами, что ответил каждый
   источник, что показали) в файле, который можно просто открыть и
   переслать — без копирования экрана и без DevTools.

   Файл markdown, а не json: он читается и человеком, и без всякой
   обработки, а разбор читается сверху вниз. Имя фиксированное
   (lyrics-report.md) — дописываем, а не плодим файлы: иначе на
   двадцатом клике в папке будет двадцать разных имён.

   ⚠️ размер ограничен. Разбор небольшой, но «перезагрузил пять раз» даёт
   пять отчётов по 3кБ, и за пару месяцев активной отладки файл успел бы
   вырасти до мегабайта. При превышении листа начинаем заново, а прошлый
   уводим в .1 — чтобы свежие жалобы не терялись. */
const LYRICS_REPORT_MAX = 256 * 1024
ipcMain.handle('lyrics-report', (_, payload) => {
  const file = path.join(app.getPath('userData'), 'lyrics-report.md')
  try {
    const header = `\n\n---\n\n${payload && payload.text ? String(payload.text) : '(пусто)'}\n`
    let size = 0
    try { size = fs.statSync(file).size } catch {}
    if (size + header.length > LYRICS_REPORT_MAX) {
      /* предыдущий лист уводим в .1, чтобы не потерять совсем */
      try { fs.renameSync(file, file + '.1') } catch {}
    }
    fs.appendFileSync(file, header, 'utf8')
    return { ok: true, path: file }
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) }
  }
})

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

/* ─── net-fetch: прямой https к сторонним сервисам ───────────────────────────
   Отдельный канал от sc-fetch: там soundcloud-сессия с DataDome-cookie и
   client_id в URL. Здесь — обычный GET без куки, с браузерным User-Agent
   (lrclib.net отвечает 403 на пустой/нечеловеческий UA, genius.com не
   отдаёт CORS-заголовки, поэтому из рендерера напрямую не уехать).
   Отдаём сырой текст: genius отвечает HTML, который разбирает рендерер.
   Хосты зафиксированы — иначе это просто открытый прокси наружу. */
const NET_FETCH_HOSTS = new Set(['lrclib.net', 'genius.com'])
const NET_FETCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

ipcMain.handle('net-fetch', async (_, url, headers = {}) => {
  let parsed
  try { parsed = new URL(url) } catch { return { error: 'bad_url' } }
  if (parsed.protocol !== 'https:' || !NET_FETCH_HOSTS.has(parsed.hostname))
    return { error: 'host_not_allowed' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': NET_FETCH_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
      },
    })
    return { status: res.status, body: await res.text() }
  } catch (e) {
    return { error: String(e?.message || e) }
  } finally {
    clearTimeout(timer)
  }
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
  /* discord НЕ поднимается здесь: решение принимает тумблер в настройках,
     renderer шлёт 'discord-rpc-enabled' после загрузки настроек */
  globalShortcut.register('MediaPlayPause',     () => win?.webContents.send('media-play-pause'))
  globalShortcut.register('MediaNextTrack',     () => win?.webContents.send('media-next'))
  globalShortcut.register('MediaPreviousTrack', () => win?.webContents.send('media-prev'))
})

app.once('before-quit', async (event) => {
  event.preventDefault()
  globalShortcut.unregisterAll()
  discordWanted = false
  if (discordRetryTimer) { clearTimeout(discordRetryTimer); discordRetryTimer = null }
  try {
    if (discordReady && discordClient?.user) await withTimeout(discordClient.user.clearActivity(), 1500)
    if (discordClient) await withTimeout(discordClient.destroy(), 1500)
  } catch {}
  app.exit(0)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
