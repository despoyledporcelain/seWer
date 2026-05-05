# карта renderer/index.html

весь ui — один файл ~2500 строк. jsx компилируется babel standalone в браузере.

## структура файла

| строки    | что                                                        |
|-----------|------------------------------------------------------------|
| 1–76      | `<head>`: cdn-скрипты (react **production**), css (`:root` vars, `#app-shell`, titlebar, scrollbar) |
| 77–93     | `#app-shell` + `#titlebar` html: wrapper с border-radius + кнопки minimize/maximize/close |
| 94–2501   | `<script type="text/babel">`: весь react                   |

## css-переменные (строка 14)

```css
--bg: #07070a   --border: rgba(255,255,255,0.055)
--text: #ededf4   --accent: #b2b2b2   --titlebar-h: 28px
```

**`#app-shell`** — `position:fixed; inset:0; border-radius:12px; overflow:hidden; display:flex; flex-direction:column` — единственный визуальный контейнер окна; режет все дочерние элементы по скруглению. `#titlebar` — flex-child внутри него (не fixed).

глобально: `*, *::before, *::after { user-select: none }` — текст не выделяется.  
`input[type=number]` — спинеры скрыты через `-webkit-appearance:none`.

**скроллбары:**
- `.scroll-thin` — кастомный webkit-скроллбар: 8px ширина (большая зона захвата), визуально 2px через `border: 3px solid transparent + background-clip: content-box`. hover → 4px + ярче. track margin `10px 0`.
- `.scroll-home` — дополняет `.scroll-thin` для домашней сетки: `margin-top:82px; margin-bottom:18px` (выравнивает трек скроллбара по высоте карточек, ниже хедера поиска).

шрифт: **Proxima Soft** (локальный, `renderer/fonts/ProximaSoft-Bold.ttf`, подключён через `@font-face`).

анимации: `breathe` (масштаб+opacity), `spin` (360°)

## утилиты

**строка 98** — `smoothScroll(el, targetTop, duration)` — плавный скролл с easing `easeInOutQuad`  
**строка 112** — `DEMO_TRACKS` удалён. треки стартуют с `[]`.  
**строка 123** — `fmt(s)` → строка `M:SS`  
**строка 128** — `SoundCloudIcon({ size=16, fill='currentColor' })` — настоящий логотип SC из `assets/icon.svg`, инлайн SVG с viewBox `-271 345.8 256 111.2`  
**строка 149** — `scHashColor(id)` → `hsl(...)` по числовому id трека

## компоненты (по порядку в файле)

### `WaveProgressBar` — строки 156–279
пропсы: `{progress [0–1], elapsed, total, onSeek(v), isPlaying}`  
canvas-волна H=52. drag по всей ширине → onSeek.  
**анимация замораживается на паузе**: `accT` накапливается только пока `isPlaying=true`, при resume продолжает с того же места без рывков. refs: `accT`, `lastNow`, `progRef`, `dispProg`, `playRef`, `dragging`, `pendingSize`.

### `ThinVolumeSlider` — строки 281–394
пропсы: `{volume [0–1], onChange(v)}`  
canvas TW=28px, вертикальный. drag вверх = больше. onChange вызывается в реальном времени на каждом mousemove.

### `AlbumArt` — строки 396–418
пропсы: `{track, isPlaying}`  
если `track.coverUrl` — только `<img>`, никаких фоновых слоёв. иначе: нейтральный `#111116` + иконка ноты (svg, opacity 0.13).

### `MagBtn` — строки 420–437
пропсы: `{onClick, active, children, size=52}`  
круглая кнопка. press-scale 0.83.

### `PlayBtn` — строки 439–468
пропсы: `{isPlaying, onToggle}`  
кнопка 66px. press-scale 0.89.

### `NavIcon` — строки 470–485
пропсы: `{icon, label, active, onClick, size=38, noActiveBg=false}`  
кнопка сайдбара 38px. `noActiveBg=true` отключает встроенный active-фон (нужно когда поверх рисуется анимирующийся пилл).

### `TrackRow` — строки 487–518
пропсы: `{track, isActive, onClick}`  
строка библиотеки: миниатюра 34px + title/artist + duration. высота ~50px.  
обёрнут в `React.memo`. `contentVisibility:'auto', containIntrinsicSize:'auto 50px'` — браузер пропускает рендер строк вне вьюпорта нативно.  
фон active рисует пилл в `VirtualTrackList`. `position:relative, zIndex:1` чтобы быть поверх пилла. фон миниатюры — нейтральный `#111116`.

### `VirtualTrackList` — строки 520–572
пропсы: `{items, activeId, onClickItem, scrollToActive}`  
рендерит все строки сразу — видимость управляется CSS `content-visibility:auto` на каждом `TrackRow`, без js-виртуализации. ROW_H=50.  
содержит абсолютно позиционированный «пилл» — `top: activeIdx * ROW_H + 2`, CSS transition `0.42s cubic-bezier(0.22,1,0.36,1)`.  
`scrollToActive` — числовой триггер: при изменении скроллит список к активному треку (центрирует).  
scroll-контейнер имеет `className="scroll-thin"`, `willChange:'transform'`.

### `HomeCard` — строки 591–651
пропсы: `{track, onClick, artRef, artHidden, isLiked, onLike}`  
карточка сетки. hover-scale 1.03. `artRef` — ref на div-обложку (для HeroClone). `artHidden` — скрывает обложку во время reverse-hero. фон art-div всегда `#111116`; заглушка — иконка ноты (svg).  
**сердечко** — правый нижний угол обложки, `opacity: hov || isLiked ? 1 : 0`. цвет `var(--accent)` если залайкан. `onLike=null` когда `sourceMode!=='sc'` — тогда сердечко не рендерится.

### `HeroClone` — строки 652–705
пропсы: `{hero: {track, startRect, targetRect: {left,top,size}}, exiting, reverse=false}`  
ReactDOM.createPortal → document.body. CSS transition 340ms. фон `#111116`; если `coverUrl` — только img; иначе — иконка ноты.

### `Sidebar` — строки 706–820
пропсы: `{navActive, onNav, libCollapsed, onToggleLib, inPlayer, scAuth, profileRef, sourceMode, onToggleSource}`  
левая панель 58px.  
- **сверху — аватар-кнопка soundcloud**: квадратная 44×44, `borderRadius:12`, кликом → `onNav('soundcloud')`. `profileRef` на этом блоке (для AvatarFlyClone). Когда `navActive==='soundcloud'` — рамка `1px` светлеет до `rgba(178,178,178,0.55)`. Содержимое: при `scAuth?.avatarUrl` — `<img>`, иначе — `SoundCloudIcon` оранжевый (size=22)
- **nav-группа** (Треки + **Поиск** + Плеер) с **анимирующимся пиллом**:
  - NAV: `[{id:'home'}, {id:'search', иконка лупы}, {id:'library'}]`
  - `navRefs` на каждую кнопку, `useLayoutEffect([navActive, inPlayer])` мерит `offsetTop`/`offsetHeight` активной → state `pillRect`
  - абсолютный div рендерится в группе: `top/height` из `pillRect`, transition `0.34s cubic-bezier(0.22,1,0.36,1)`
  - `pillRect.visible=false` (opacity:0) когда `navActive` это `soundcloud`/`settings` — пилл исчезает плавно
- collapse-кнопка библиотеки (видна только в view='player')  
- внизу: кнопка **Локальная библиотека** (иконка папки) — toggle режима, видна только при `scAuth`. `active=sourceMode==='local'`. над настройками  
- настройки  

### `CrossfadeSlider` — строки 821–881
пропсы: `{value [0–12], onChange(v)}`  
горизонтальный слайдер кроссфейда 0–12 сек. поддерживает wheel (passive:false) — колёсико мыши меняет значение, не скроллит страницу. refs: `trackRef`, `dragging`, `onChangeRef`, `valueRef`.

### `SettingsView` — строки 882–1091
пропсы: `{settings, onSettings, visible, onScanTracks, onClearFolder}`  
секции: playback / system / about.  
**system/Локальная музыка**: кнопка «Удалить» появляется только когда `settings.musicFolder` задана (красноватая), сбрасывает путь и треки через `onClearFolder`. карточка «Данные» (очистка кеша обложек) удалена.

### `AvatarFlyClone` — строки 1092–1115
пропсы: `{fly: {avatarUrl, startRect, targetRect}, exiting}`  
portal-анимация: аватар летит из 72px блока в SoundCloudView в 44px квадратный аватар сайдбара (`borderRadius:12`). та же механика что у HeroClone (позиция на targetRect, transform в startRect, transition к identity).

### `SoundCloudView` — строки 1116–1205
пропсы: `{visible, scAuth, onLogin, onLogout, avatarRef}`  
два состояния:
- **не залогинен**: центрированный экран с `SoundCloudIcon` + кнопка «войти через браузер»; `avatarRef` на контейнер иконки (стартовая точка анимации аватара)
- **залогинен (профиль-заглушка)**: круглый аватар 104px + «SIGNED AS» + ник + кнопка «выйти». список лайков **здесь больше не показывается** — он переехал в `home`/`player` через `sourceMode`.

### `SearchTrackRow` — строки 1206–1247
пропсы: `{track, isLiked, onLike, onClick, onCoverClick}`  
строка результата поиска: обложка 44px + title/artist + duration + сердечко.  
клик по обложке → `onCoverClick` (играть без перехода во вкладку), клик по тексту → `onClick` (играть + переход в player).  
сердечко: opacity 0→1 при hover или если залайкан. цвет `var(--accent)`.

### `SearchView` — строки 1248–1408
пропсы: `{visible, scAuth, likedIds, onLike, onPlayTrack, onSelectTrack}`  
**пустое состояние**: только searchbar, `top: '36%'`.  
**с результатами**: searchbar анимируется на `top: '8%'` (transition 0.42s), снизу появляются результаты.  
debounce 380ms. infinite scroll — `handleScroll` при достижении низа вызывает `doSearch(query, offset)`.  
запросы: `search/tracks?limit=20&offset=N` + `search/users?limit=4` (только при offset=0).  
**исполнители**: grid 4 колонки.  
**треки**: список `SearchTrackRow`.  
скроллбар: `className="scroll-thin"`, `right:10`, `willChange:'transform'`.

### `App` — строки 1409–2497

**state:**
```
view               'home'|'player'|'settings'|'soundcloud'|'search'
tracks             [] | локальные треки
trackIdx           0
isPlaying          false
progress           0–1
shuffle            false
repeat             'off'|'all'|'one'
navActive          'home'
search             ''
volume             0.7
hero               null | {track, startRect, targetRect}
playerVisible      false
homeVisible        true
heroExiting        false
reverseHero        null | {track, startRect, targetRect}
reverseHeroExiting false
avatarFly          null | {avatarUrl, startRect, targetRect}
avatarFlyExiting   false
libCollapsed       false
settings           {autoplay, crossfade, defaultRepeat, startWithWindows, minimizeToTray,
                    musicFolder, customTitles, minDuration, soundcloudAuth, sourceMode}
sort               'added'|'artist'|'title'|'duration'
editingTitle       false
editValue          ''
scTracks           [] — лайки SC (текущий список с file:/// coverUrl где есть)
scLoading          false — первая загрузка (когда нет кэша)
scUpdating         false — фоновая инкрементная проверка (когда есть кэш)
scError            null | string
scPlayingTrack     null | {id, title, artist, duration, color, coverUrl, streamUrl, resolvedUrl}
scPlayingIdx       -1 | number — индекс в scTracks
libScrollTrigger   0 — числовой триггер скролла к активному треку в библиотеке
searchFocused      false
```

`settings.soundcloudAuth` — `{ token, clientId, userId, username, avatarUrl }` — хранится в settings.json  
`settings.sourceMode` — `'local' | 'sc'` — хранится в settings.json  
`track` — вычисляется как `scPlayingTrack || tracks[trackIdx] || tracks[0]`  
`likedIds` — `useMemo(() => new Set(scTracks.map(t => t.id)), [scTracks])` — для быстрой проверки залайканности

**welcome state (home):** если `!settings.musicFolder && !settings.soundcloudAuth` — показывается центрированный empty state с двумя кнопками («выбрать папку» / «войти в soundcloud»). хедер с поиском/сортировкой в этом случае скрыт. условие — `showWelcome` (рядом с `activeList`).

**эффективный sourceMode (derived, строка 1579):**
```js
sourceMode = (settings.soundcloudAuth && settings.sourceMode === 'sc') ? 'sc' : 'local'
```
без auth — всегда `'local'` (защита от рассинхрона).

**refs:**
```
artRefs          {}   — ref на каждую HomeCard обложку (по track.id, не по origIdx)
playerArtRef     null — ref на AlbumArt в PlayerView
audioRef         null — HTML5 Audio объект
handleNextRef    null — актуальная ссылка на handleNext
handlePrevRef    null — актуальная ссылка на handlePrev
isPlayingRef     bool
homeScrollRef    null
editCancelRef    bool
customTitlesRef  {}
minDurationRef   30
scAvatarRef      null — ref на иконку в SoundCloudView (старт анимации аватара)
sidebarProfileRef null — ref на иконку профиля в Sidebar (цель анимации)
scTracksRef      []   — синхронизируется с scTracks; используется в handleNext/Prev
scAuthRef        null — синхронизируется с settings.soundcloudAuth
scCacheRef       []   — данные api в формате с CDN coverUrl (для записи в sc_likes.json)
prevSearchRef      ''
homeSearchRef      null
libSearchRef       null
discordTimerRef    null — debounce-таймер Discord RPC обновлений
discordProgressRef 0    — всегда актуальный `progress` (синхронизируется каждый рендер); используется внутри setTimeout-коллбэков чтобы не захватывать стейл-значение
```

**useEffect-ы (аудио):**
- монтирование: создаёт `new Audio()`, вешает `timeupdate` → setProgress, `ended` → handleNextRef
- `[trackIdx, track?.path, scPlayingTrack]`: обновляет `audio.src` для локальных треков; если `scPlayingTrack` — пропускает (управляется через `handleScTrackClick`)
- `[isPlaying]`: `audio.play()` / `audio.pause()`
- `[volume]`: `audio.volume = volume`
- `[]` медиаклавиши

**useEffect-ы (данные):**
- `[]` монтирование: `loadSettings()` → восстанавливает settings + сканирует musicFolder + `loadCovers`
- `[settings]`: `saveSettings(settings)`
- `[trackIdx]`: сбрасывает `editingTitle`
- `[search]`: если очистили поиск и играет SC — триггерит libScrollTrigger
- `[settings.soundcloudAuth]`: если токен есть → `initScLikes(auth)`; иначе → `setScTracks([])` + чистит `scCacheRef`
- `[view]`: ctrl+f переключает фокус между home/lib search

**useEffect-ы (Discord RPC):**
- `[track?.id, isPlaying]` — 800мс debounce → `discordUpdate` с title/artist/duration/progress/coverUrl. coverUrl: берёт HTTPS-ссылку из `track.coverUrl`; если там `file://` — ищет CDN URL в `scCacheRef` по id. timestamps (`startTimestamp`/`endTimestamp`) вычисляются в main.js из `progress * duration`.
- `[]` cleanup — при размонтировании: `discordClear()`

**ключевые функции:**
- `handleNext()` — строка 1319: в SC режиме (`scPlayingTrack !== null`) — следующий трек в `scTracks`; иначе обычная логика (repeat/shuffle/local). определяется по тому **что играет**, не по `sourceMode`
- `handlePrev()` — строка 1348: симметрично
- `handleSeek(v)` — строка 1438: кроме перемотки аудио немедленно обновляет `discordProgressRef.current` и через 400мс шлёт Discord RPC с актуальной позицией
- `commitEdit()` — строка 1379: сохраняет кастомное название в `tracks` state и `settings.customTitles`
- `loadCovers(tracksArr)` — строка 1391: 16 воркеров параллельно, base64 обложки для локальных файлов
- `handleScanTracks(folder)` — строка 1420: сканирует папку
- `handleClearFolder()` — сбрасывает `settings.musicFolder` в null, `tracks` в `[]`, `trackIdx/isPlaying/progress` в начальные значения
- `loadScLikes(auth, opts={})` — строка 1435: пагинированная загрузка лайков SC (`users/{userId}/likes?limit=200`), до 20 страниц. **`opts.silent=true`** — не сбрасывать UI (для fallback из incremental). После загрузки: записывает `scCacheRef.current` + сохраняет на диск через `scSaveLikesCache`. Затем `scCheckCovers` для уже кэшированных, потом `loadScCovers` фоном
- `loadScCovers(tracksArr)` — строка 1493: 6 воркеров, скачивает обложки в `%AppData%\seWer\sc_covers\{id}.jpg`, flush каждые 20
- `incrementalScUpdate(auth)` — строка 1519: грузит первую страницу api, проходит пока не встретит знакомый id из `scCacheRef`. Если нашёл — добавляет накопленные новые в начало `scTracks`+`scCacheRef`+ записывает на диск. Если **не** нашёл (кэш сильно отстал) — fallback на `loadScLikes(auth, {silent:true})`. Удалённые лайки не отслеживаются
- `initScLikes(auth)` — строка 1574: точка входа. Читает `scLoadLikesCache` → если кэш есть, мгновенно показывает + фоном `incrementalScUpdate`. Если нет — `loadScLikes(auth)` (полная загрузка)
- `handleScLogin(auth)` — строка 1594: сохраняет auth в settings + `sourceMode:'sc'`, запускает анимацию аватара (`AvatarFlyClone`)
- `handleScLogout()` — строка 1606: чистит `scCacheRef` + `scSaveLikesCache([])` + сбрасывает `soundcloudAuth` и `sourceMode='local'`
- `handleToggleSource()` — строка 1611: toggle `settings.sourceMode` между `'sc'` и `'local'` (кнопка папки в сайдбаре)
- `handleScTrackClick(scTrack, idx)` — строка 1614: резолвит stream URL через `sc-fetch`, ставит `audio.src`, играет. **Не управляет view** (это делает `selectTrack`/`handleNav`)
- `selectTrack(t)` — строка 1639: принимает **track-объект** (раньше принимал idx). Работает в обоих режимах: если `view==='player'` — просто меняет трек; иначе — hero-анимация home→player. SC: вызывает `handleScTrackClick`. Local: `setTrackIdx(tracks.indexOf(t))` + `setScPlayingTrack(null)`
- `sortedTracks` — строка 1677: useMemo, сортирует local tracks по `sort`
- `filtered` — строка 1685: sortedTracks фильтрованные по search
- `filteredSc` — строка 1689: scTracks фильтрованные по search
- `activeList` — строка 1693: `sourceMode==='sc' ? filteredSc : filtered` — единый источник для home grid и library panel
- `activeListPlayingId` — строка 1694: id играющего трека если он есть в `activeList` (иначе null — ничего не подсвечивается)
- `handleLike(track)` — PUT/DELETE `me/track_likes/{id}`, оптимистично обновляет `scTracks` + `scCacheRef` + сохраняет кэш на диск
- `handleNav(id)` — смена view; reverse-hero берёт `artRefs.current[track.id]`. `search`: без delay, `setView('search')` сразу. `library` из search/settings: `setPlayerVisible(true)` + `setView('player')` без delay

**layout:**
```
Sidebar(58px) | LibraryPanel(260px) | CenterPlayer(flex:1) | VolumeSlider(28px)
```

**home grid и library panel** — единый источник `activeList`:
- если `sourceMode==='sc'` → SC лайки (`filteredSc`)
- если `sourceMode==='local'` → локальные (`filtered`)

**SC трек-объект:**
```js
{
  id, title, artist, duration,
  color,       // scHashColor(id)
  coverUrl,    // CDN-url или file:// после кэша
  streamUrl,   // api-v2 endpoint для резолва
  resolvedUrl, // только у scPlayingTrack — финальный CDN audio URL
}
```
в `scCacheRef` и в `sc_likes.json` хранятся объекты с **CDN-coverUrl** (без `file://`), чтобы при следующем запуске обложки можно было перепроверить через `scCheckCovers` или докачать через `loadScCovers`.

**анимации:**
- home→player: HeroClone 340мс
- player→home: reverse HeroClone
- SC логин: AvatarFlyClone 440мс (avatarRef → sidebarProfileRef)

**ipc-методы (preload.js):**
- window/файлы/настройки — без изменений
- `scLogin`, `scCheckCovers`, `scCacheCover` — как было
- `scFetch(url, token, clientId, method='GET')` — поддерживает GET/PUT/DELETE; 200/201/204 как успех; пустой ответ → `{data: null}`
- `scLoadLikesCache()` → читает `%AppData%\seWer\sc_likes.json`, `scSaveLikesCache(data)` → пишет туда
- `discordUpdate(data)` → `discord-update` ipc: обновляет Discord Rich Presence (type=2 Listening, details=title, state=artist, largeImageKey=coverUrl, startTimestamp/endTimestamp)
- `discordClear()` → `discord-clear` ipc: снимает presence

**Discord RPC (main.js):**
- clientId `1501214545136586792`, пакет `@xhayper/discord-rpc`, dynamic `import()`
- `initDiscord()` — вызывается в `app.whenReady()`, использует `client.login()` (не `connect()`)
- `before-quit` с `event.preventDefault()` — дожидается `clearActivity()` + `destroy()` перед выходом, чтобы presence не утекала после закрытия приложения

**Tray (main.js):**
- `createTray()` — вызывается в `app.whenReady()` после `createWindow()`; иконка `assets/icon.png`; tooltip `seWer`
- двойной клик → `win.show(); win.focus()`
- контекстное меню: «Открыть» / «Выйти» (`app.quit()`)
- `win-close` ipc — читает `loadSettings()`; если `minimizeToTray` → `win.hide()`, иначе → `win.close()`

**home div** — `opacity: homeVisible ? 1 : 0`, `transition: 'opacity 0.18s ease'` (без transform — анимацию перехода обеспечивает HeroClone). `right:10` для отступа скроллбара от края.

**SearchView** в рендере: `likedIds`, `onLike={handleLike}`, `onPlayTrack` → `handleScTrackClick(t, -1)` (играть без смены view), `onSelectTrack` → играть + `setPlayerVisible(true)` + `setView('player')`.

### рендер (строка 2498)
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
```
