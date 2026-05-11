# карта renderer/index.html

весь ui — один файл ~2800 строк. jsx компилируется babel standalone в браузере.

## структура файла

| строки    | что                                                        |
|-----------|------------------------------------------------------------|
| 1–76      | `<head>`: cdn-скрипты (react production + babel), `hls.min.js` локальный, css (`:root` vars, `#app-shell`, titlebar, scrollbar) |
| 77–93     | `#app-shell` + `#titlebar` html |
| 94–end    | `<script type="text/babel">`: весь react |

## css-переменные

```css
--bg: #07070a   --border: rgba(255,255,255,0.055)
--text: #ededf4   --accent: #b2b2b2   --titlebar-h: 28px
```

**анимации:** `breathe`, `spin`, `fadeInUp`, `fadeOutDown`, `artEntrance`, `marqueeScroll`

**скроллбары:** `.scroll-thin` (8px зона, 2px визуально), `.scroll-home` (отступы под хедер сетки)

шрифт: **Proxima Soft** (`renderer/fonts/ProximaSoft-Bold.ttf`)

## assets

```
assets/
  icon.png / icon.svg       — иконка приложения
  play.png / pause.png      — кнопки плеера
  forward.png / rewind.png  — prev/next
  shuffle.png / repeat.png / repeat1.png — управление
  tracks.png / search.png / player.png   — sidebar nav
  local.png / settings.png               — sidebar bottom
  note.png                  — заглушка обложки (TrackRow, AlbumArt, HomeCard, HeroClone)
  vosproizvedenie.png / system.png / about.png — секции настроек
```

## утилиты

- `smoothScroll(el, targetTop, duration)` — плавный скролл easeInOutQuad
- `fmt(s)` → `M:SS`
- `SoundCloudIcon({ size, fill })` — инлайн SVG логотип SC
- `scHashColor(id)` → `hsl(...)` по id трека

## i18n

```
STRINGS        — объект { ru: {...}, en: {...} }, ~70 ключей
LangContext    — React.createContext('ru')
useLang()      — хук: возвращает t(key), читает LangContext
```

язык берётся из `settings.language` ('RU' | 'EN', default 'RU'), нормализуется в lowercase.  
`App` вычисляет `lang` и `t` на каждом рендере, оборачивает JSX в `<LangContext.Provider value={lang}>`.  
компоненты вызывают `const t = useLang()` внутри себя.  
**исключение**: `SearchView` использует `const T = useLang()` — буква `t` занята переменной трека в `.map(t => ...)`.  
`useEffect` в `App` обновляет `title` у кнопок тайтлбара при смене языка (статичный HTML вне React).

## компоненты

### `MarqueeText`
пропсы: `{text, style, onClick}`
прокрутка длинного текста. `useLayoutEffect` измеряет overflow после каждого изменения `text`. если текст влазит — `textAlign:'center'`; если нет — `textAlign:'left'` + CSS анимация `marqueeScroll` (пауза 1.8с → едет → пауза → возврат). скорость ~38px/s, длительность динамическая.

### `PlayerLikeBtn`
пропсы: `{liked, onLike}`
сердечко 19px в плеере (только для SC треков). hover через `useState`. filled/outline зависит от `liked`. scale 1.18 при hover.

### `WaveProgressBar`
пропсы: `{progress, elapsed, total, onSeek, isPlaying, visible}`
canvas-волна H=52. drag → onSeek. анимация замораживается на паузе. rAF останавливается при `visible=false`.
**прогресс**: при `isPlaying` — `dispProg` двигается по реальному времени (`dt / total` за кадр) + мягкая коррекция дрейфа `* 0.015` к `progRef`. при паузе — только сглаживание.

### `ThinVolumeSlider`
пропсы: `{volume [0–1], onChange}`
canvas TW=28px, вертикальный. drag вверх = больше. `#c8c8c8` fill с glow, без thumb.

### `AlbumArt`
пропсы: `{track, isPlaying}`
если `track.coverUrl` — `<img>`. иначе: `#111116` фон + `assets/note.png` (opacity 0.13).

### `MagBtn`
пропсы: `{onClick, active, children, size=52}`
круглая кнопка, press-scale 0.83.

### `PlayBtn`
пропсы: `{isPlaying, onToggle}`
кнопка 66px. использует `assets/play.png` / `assets/pause.png` с crossfade-анимацией между ними.

### `NavIcon`
пропсы: `{icon, label, active, onClick, size=38, noActiveBg=false}`
кнопка сайдбара 38px. **активность через `opacity`**: active=1, inactive=0.3 (не через `color` — работает с PNG иконками).

### `TrackRow`
пропсы: `{track, isActive, isLoading, onClick}`
строка библиотеки. высота жёстко 50px. миниатюра 34px — если нет обложки: `assets/note.png` (opacity меняется с active).
**спиннер загрузки**: справа от текста, слева от времени — 14px кружок (`border-top` акцент), `opacity` 0→1 по `isLoading`, `animation: spin 0.75s linear infinite`.

### `VirtualTrackList`
пропсы: `{items, activeId, loadingId, onClickItem, scrollToActive, scrollTargetId}`
ROW_H=50. CSS `content-visibility:auto`. абсолютный пилл с transition `0.42s cubic-bezier`. `loadingId` пробрасывается в `TrackRow.isLoading`.

### `HomeCard`
пропсы: `{track, onSelect, artRef, artHidden, isLiked, onLike}`
карточка сетки. hover-scale 1.03. заглушка — `assets/note.png`. сердечко при `sourceMode==='sc'`.

### `HeroClone`
пропсы: `{hero, exiting, reverse=false}`
portal → document.body. CSS transition 340ms. заглушка — `assets/note.png`.

### `Sidebar`
пропсы: `{navActive, onNav, libCollapsed, onToggleLib, inPlayer, scAuth, profileRef, sourceMode, onToggleSource, avatarFlying}`
левая панель 58px.
- **SC аватар** 44×44 вверху → `onNav('soundcloud')`
- **NAV** `[home→tracks.png, search→search.png, library→player.png]` с анимирующимся пиллом
- **collapse-кнопка** (только в player)
- **local.png** — toggle sourceMode (только при scAuth)
- **settings.png** → настройки

все иконки: `<img src="../assets/X.png" filter:brightness(0)invert(1)>`, opacity через NavIcon.

### `CrossfadeSlider`
пропсы: `{value [0–12], onChange}`
drag через `setPointerCapture` (onPointerDown/Move/Up). wheel (passive:false). визуал: 6px трек без thumb, `#c8c8c8` fill с glow, hit-зона 24px.

### `SettingsView`
пропсы: `{settings, onSettings, visible, onScanTracks, onClearFolder, onClearCoversCache, onClearLikesCache}`
секции: `playback`→`vosproizvedenie.png`, `appearance`→`theme.png`, `system`→`system.png`, `about`→`about.png`.

**playback**: только CrossfadeSlider (autoplay и defaultRepeat удалены — были мёртвым кодом).

**appearance**: карточка «Интерфейс» (hideDividers) + карточка «Discord» с toggle discordRpc и анимированным блоком кастомизации:
- **Таймстамп**: чипы `progress` / `elapsed` / `none`
- **При паузе**: чипы `show` / `hide`
- **Обложка трека**: toggle discordCover

**system**: язык (RU/EN), кэш, запуск (startWithWindows → `app.setLoginItemSettings`, minimizeToTray), локальная музыка.

### `AvatarFlyClone`
portal-анимация аватара (SoundCloudView → Sidebar), 440мс.

### `SearchTrackRow`
пропсы: `{track, isLiked, onLike, onClick, onCoverClick}`
строка результата поиска. сердечко при hover или `isLiked`.

### `SearchView`
пропсы: `{visible, scAuth, likedIds, onLike, onPlayTrack, onSelectTrack, onResultsLoaded}`
рефы: `hasMoreRef`, `offsetRef` — синхронизируются каждый рендер для доступа из колбэков.
`useImperativeHandle` экспортирует:
- `focus()` — фокус на input
- `loadMore()` — подгружает следующую страницу; нет-оп если `loadingRef.current` или `!hasMoreRef.current`
`onResultsLoaded(newTracks)` — вызывается только при пагинации (не при первом поиске).

---

### `App` — state

```
view, tracks, trackIdx, isPlaying, progress, shuffle, repeat
navActive, search, volume, hero, playerVisible, homeVisible
heroExiting, reverseHero, reverseHeroExiting
avatarFly, avatarFlyExiting, avatarFlying
libCollapsed, settings, sort, editingTitle, editValue
scTracks, scLoading, scUpdating, scError
scPlayingTrack, scPlayingIdx
libScrollTrigger, libScrollTargetId, searchFocused
toast           — строка тоста или null
toastExiting    — bool, true во время fade-out анимации
loadingTrackId  — id SC трека пока идёт fetch+буферизация
artEntranceKey  — счётчик, инкремент → ремаунт обёртки AlbumArt → artEntrance анимация
```

`lang` и `t` — не state, вычисляются при каждом рендере из `settings.language`:
```js
const lang = (settings.language || 'RU').toLowerCase(); // 'ru' | 'en'
const t = key => STRINGS[lang]?.[key] ?? STRINGS.ru[key] ?? key;
```

**settings**:
```js
{
  crossfade: 0,                  // 0–12 сек
  startWithWindows: false,       // app.setLoginItemSettings
  minimizeToTray: false,
  musicFolder: '',
  customTitles: {},
  minDuration: 30,
  soundcloudAuth: null,
  sourceMode: 'local',
  language: 'RU',
  hideDividers: false,
  discordRpc: true,
  discordTimestamp: 'progress',  // 'progress' | 'elapsed' | 'none'
  discordPause: 'show',          // 'show' | 'hide'
  discordCover: true,
}
```

### `App` — refs

```
artRefs, artRefCacheRef   — refs на обложки HomeCard
playerArtRef              — ref на AlbumArt в плеере
audioRef                  — HTML5 Audio
hlsRef                    — hls.js инстанс (null если не HLS)
handleNextRef, handlePrevRef, isPlayingRef
homeScrollRef, scAvatarRef, sidebarProfileRef
scTracksRef, scAuthRef, scCacheRef, scCacheMapRef
filteredRef, filteredScRef, searchRef
volumeRef                 — синхронизируется каждый рендер (для crossfade)
settingsRef               — синхронизируется каждый рендер (для crossfade/discord)
langRef                   — синхронизируется каждый рендер (для async-функций)
crossfadeRafRef           — rAF handle для fade-in/fade-out анимации громкости
trackSwitchingRef         — true пока handleScTrackClick грузит трек; блокирует сброс громкости в isPlaying=false эффекте
toastTimerRef             — таймер скрытия тоста
discordTimerRef, discordProgressRef
prevSearchRef, homeSearchRef, libSearchRef
customTitlesRef, minDurationRef, editCancelRef
```

### `App` — helpers

- **`startFadeIn(audio)`** — отменяет текущий rAF, если `crossfade>0` устанавливает `audio.volume=0` и rAF-анимацию до `volumeRef.current` за N сек; иначе просто восстанавливает volume
- **`destroyHls()`** — уничтожает hls.js инстанс и обнуляет `hlsRef`
- **`showToast(msg)`** — показывает тост 2.2с, затем fade-out 0.24с, затем убирает из DOM
- **`handleSearchResultsLoaded(newTracks)`** — вызывается из `SearchView.onResultsLoaded`; дописывает треки в `searchQueueRef`, дошафливает в конец `scShuffleOrderRef` если shuffle активен

### `App` — crossfade (локальные треки и SC)

- **fade-out**: в `timeupdate` — если `remaining <= crossfade`, `audio.volume = volume * (remaining/crossfade)`; seek восстанавливает volume
- **fade-in SC**: `trackSwitchingRef=true` перед `setIsPlaying(false)`; `audio.volume=0` выставляется до play; `startFadeIn` вызывается в обработчике события `playing` (когда аудио реально начало воспроизводиться, не во время буферизации); `trackSwitchingRef=false` сбрасывается там же
- **fade-in local**: `startFadeIn(audio)` вызывается перед `audio.play()` в useEffect смены трека
- **пауза**: при `isPlaying=false` — отменяет rAF; восстанавливает `audio.volume` только если `!trackSwitchingRef.current`

### `App` — handleScTrackClick

1. `trackSwitchingRef=true`, `setIsPlaying(false)`, `setLoadingTrackId(scTrack.id)`
2. fetch `streamUrl` → если нет → fetch `hlsUrl` (fallback)
3. если оба недоступны → `trackSwitchingRef=false`, markError, skipInDirection если autoSkip
4. `setScPlayingTrack(resolved)`
5. `audio.volume = cf>0 ? 0 : volumeRef.current`
6. регистрирует `audio.addEventListener('playing', ..., {once:true})` → `trackSwitchingRef=false`, `startFadeIn`
7. если HLS → hls.js: `loadSource` → `attachMedia` → `MANIFEST_PARSED` → play
8. иначе progressive → `audio.src` → `audio.load()` → play
9. `setLoadingTrackId(null)` в `.then()` от `audio.play()`

### `App` — handleLike

`PUT /users/{userId}/track_likes/{id}` — лайк, `DELETE` — анлайк. запросы идут через `sc-fetch` (main process) с DataDome cookie из сессии `persist:soundcloud`. при ошибке — тост, UI не обновляется.

### `App` — initScLikes (кеш-миграция)

Если `cache[0]` не имеет `hlsUrl` как own property → кеш старого формата → `loadScLikes(auth)` (полная перезагрузка). Одноразовая миграция.

### `App` — SC трек-объект

```js
{ id, title, artist, duration, color, coverUrl,
  streamUrl,   // progressive endpoint (может быть null)
  hlsUrl,      // HLS endpoint (может быть null)
  resolvedUrl, // только у scPlayingTrack — финальный CDN URL
}
```

### `App` — Discord RPC

useEffect зависит от `[track?.id, isPlaying, settings.discordRpc, settings.discordTimestamp, settings.discordPause, settings.discordCover]`.
- `discordRpc=false` или `!track` → `discordClear`
- `discordPause='hide'` и `!isPlaying` → `discordClear`
- иначе → `discordUpdate({ title, artist, duration, progress, coverUrl, isPlaying, timestamp })`

`timestamp` в main.js: `'progress'` → start+end (progress bar), `'elapsed'` → только start, `'none'` → без timestamp.

### `App` — анимации

- **home→player**: HeroClone 340мс (hero clone летит)
- **player→home**: reverse HeroClone
- **SC логин**: AvatarFlyClone 440мс
- **artEntrance**: при `view→'player'` без hero → `artEntranceKey++` → внутренняя обёртка AlbumArt ремаунтится → `scale(0.86)→scale(1) + opacity 0→1`, 420мс, `cubic-bezier(0.34,1.56,0.64,1)`
- **библиотека**: появление `opacity 0.36s ease 0.1s, transform 0.44s ... 0.1s` (синхронно с центральным контентом)
- **тост**: fade-in `fadeInUp 0.18s` → через 2.2с fade-out `fadeOutDown 0.24s` → убирается из DOM

### рендер
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
```
