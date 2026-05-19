# карта renderer/index.html

весь ui — один файл ~3600 строк. jsx компилируется babel standalone в браузере.

## структура файла

| строки    | что                                                        |
|-----------|------------------------------------------------------------|
| 1–76      | `<head>`: cdn-скрипты (react production + babel), `hls.min.js` локальный, `gsap.min.js` (CDN), css (`:root` vars, `#app-shell`, titlebar, scrollbar) |
| 77–93     | `#app-shell` + `#titlebar` html |
| 94–end    | `<script type="text/babel">`: весь react |

## css-переменные

```css
--bg: #07070a   --border: rgba(255,255,255,0.055)
--text: #ededf4   --accent: #b2b2b2   --titlebar-h: 28px
```

**анимации:** `breathe`, `spin`, `fadeInUp`, `fadeOutDown`, `artEntrance`

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
- `fmtCount(n)` → `12.4K` / `1.2M` / `null` если 0 — форматирование больших чисел
- `splitArtists(str)` → `[{name, sep}]` — парсит мультиартистную строку по разделителям (`&`, `,`, `.`, `x`, `feat.`, `vs.` и т.д.)
- `SoundCloudIcon({ size, fill })` — инлайн SVG логотип SC
- `scHashColor(id)` → `hsl(...)` по id трека

## i18n

```
STRINGS        — объект { ru: {...}, en: {...} }, ~80 ключей
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
пропсы: `{text, style, onClick, maxWidth?}`
ellipsis + tooltip. `useLayoutEffect` проверяет overflow после изменения `text`/`maxWidth`. если текст обрезан — при hover показывает кастомный тултип (абсолютный div, `fadeInUp 0.15s`). если `maxWidth` задан — `width:fit-content, maxWidth`; иначе `flex:1, minWidth:0`.

### `PlayerLikeBtn`
пропсы: `{liked, onLike, style?}`
сердечко 19px в плеере (только для SC треков). hover через `useState`. filled/outline зависит от `liked`. scale 1.18 при hover. принимает `style` для дополнительного позиционирования.

### `WaveProgressBar`
пропсы: `{progress, elapsed, total, onSeek, isPlaying, visible}`
div-based pill bar (H=8px, `borderRadius:8`). нет canvas. rAF обновляет `fillRef.style.transform = scaleX(p)` (GPU-only, без layout recalculation). drag → onSeek. таймкоды слева/справа через `elapsedSpanRef`/`remainingSpanRef` — обновляются тем же rAF. rAF останавливается при `visible=false`.

### `ThinVolumeSlider`
пропсы: `{volume [0–1], onChange}`
canvas TW=28px, вертикальный. drag вверх = больше. `#c8c8c8` fill с glow, без thumb.

### `AlbumArt`
пропсы: `{track, isPlaying}`
если `track.coverUrl` — `<img>`. иначе: `#111116` фон + `assets/note.png` (opacity 0.13). `borderRadius:16` (совпадает с HomeCard и HeroClone для бесшовного hero-перехода).

### `MagBtn`
пропсы: `{onClick, active, children, size=52}`
круглая кнопка, press-scale 0.83. в плеере `size` передаётся как CSS `clamp()` строка.

### `PlayBtn`
пропсы: `{isPlaying, onToggle}`
кнопка `clamp(50px, 6.2vw, 76px)`. иконка `clamp(28px, 3.6vw, 44px)`. crossfade-анимация между play/pause.

### `NavIcon`
пропсы: `{icon, label, active, onClick, size=38, noActiveBg=false}`
кнопка сайдбара 38px. **активность через `opacity`**: active=1, inactive=0.3 (не через `color` — работает с PNG иконками).

### `TrackRow`
пропсы: `{track, isActive, isLoading, isError, onClick}`
строка библиотеки. высота жёстко 50px. миниатюра 34px — если нет обложки: `assets/note.png` (opacity меняется с active).
**спиннер загрузки**: справа от текста, слева от времени — 14px кружок (`border-top` акцент), `opacity` 0→1 по `isLoading`, `animation: spin 0.75s linear infinite`.
**ошибка**: `isError` — вместо времени «недоступен» красным.

### `VirtualTrackList`
пропсы: `{items, activeId, loadingId, errorId, onClickItem, scrollToActive, scrollTargetId}`
ROW_H=50. CSS `content-visibility:auto`. абсолютный пилл с transition `0.42s cubic-bezier`. `loadingId`/`errorId` пробрасываются в `TrackRow`.

### `HomeCard`
пропсы: `{track, onSelect, artRef, artHidden, isLiked, onLike}`
карточка сетки. hover-scale 1.03. **порядок**: текст (артист→название) сверху с фоном `rgba(255,255,255,0.05)` и `borderRadius: 16 16 0 0`, затем обложка снизу. обложка имеет собственный `borderRadius:16, overflow:hidden`. карточка без `overflow:hidden` — клипинг только на арте.

### `HeroClone`
пропсы: `{hero, exiting, reverse=false}`
portal → document.body. **GSAP** `sine.inOut` 0.42s (вперёд) / 0.38s (назад). `borderRadius:16` постоянный — inner div компенсирует scale (`borderRadius / sc` на старте → `16` в конце). `tl.kill()` при анмаунте. при `exiting` — `gsap.to(opacity:0)`. `hero` объект содержит `textStartRect` (позиция текста карточки, ~46px над артом).

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

**playback**: только CrossfadeSlider.

**appearance**: карточка «Интерфейс» (hideDividers) + карточка «Discord» с toggle discordRpc и анимированным блоком кастомизации:
- **Таймстамп**: чипы `progress` / `elapsed` / `none`
- **При паузе**: чипы `show` / `hide`
- **Обложка трека**: toggle discordCover

**system**: язык (RU/EN), кэш, запуск (startWithWindows → `app.setLoginItemSettings`, minimizeToTray), локальная музыка.

### `AvatarFlyClone`
portal-анимация аватара (SoundCloudView → Sidebar), 440мс.

### `SearchTrackRow`
пропсы: `{track, isLiked, onLike, onClick, onCoverClick, isLoading, isError}`
строка результата поиска/профиля артиста.
- обложка 44px с play-оверлеем (hover) или спиннером (`isLoading`)
- title + artist (flex:1)
- справа: сердечко (интерактивное) + кол-во лайков `fmtCount`, кол-во прослушиваний + иконка, длина трека
- `isError` → вместо длины «недоступен» красным, строка затухает (opacity 0.55)

### `SearchView`
пропсы: `{visible, scAuth, likedIds, onLike, onPlayTrack, onSelectTrack, onResultsLoaded, onArtistClick, loadingTrackId, errorTrackId}`
рефы: `hasMoreRef`, `offsetRef` — синхронизируются каждый рендер для доступа из колбэков.
`useImperativeHandle` экспортирует:
- `focus()` — фокус на input
- `loadMore()` — подгружает следующую страницу; нет-оп если `loadingRef.current` или `!hasMoreRef.current`
`onResultsLoaded(newTracks)` — вызывается только при пагинации (не при первом поиске).
карточки артистов кликабельны → `onArtistClick(user)`.
`loadingTrackId`/`errorTrackId` пробрасываются в `SearchTrackRow`.

### `ArtistView`
пропсы: `{artist, visible, onClose, scAuth, likedIds, onLike, onPlayTrack, onSelectTrack, loadingTrackId, errorTrackId, artistCacheRef}`

**artist объект**: `{ id?, username, avatarUrl?, followersCount?, bannerUrl? }`

при открытии: если `artist.id` есть — фетчит `/users/{id}` → получает полный профиль (аватар, баннер, фолловеры). если только `username` — сначала `/search/users?q=username&limit=1` → затем `/users/{id}`.

**лейаут**:
- баннер 220px — если есть `bannerUrl`: изображение + тёмный градиент; иначе просто `#07070a`
- кнопка «назад» top-left, текст через `t('back')`
- внутри баннера: квадратная аватарка 148px (border-radius 14px) + имя (26px bold) + фолловеры справа

**табы**: Популярные / Треки (2 вкладки, sliding underline pill).

**загрузка треков** (useEffect на `[tab, profileId, visible]`):
- Popular → `/users/{id}/toptracks?limit=20`
- Tracks → `/users/{id}/tracks?limit=20` (+ пагинация через `next_href` при скролле)

**клик по обложке** → `onPlayTrack` (воспроизведение без перехода).
**клик по строке** → `onSelectTrack` (воспроизведение + переход в плеер).

---

### `App` — state

```
view              — 'home'|'player'|'search'|'soundcloud'|'settings'|'artist'
tracks, trackIdx, isPlaying, progress, shuffle, repeat
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
errorTrackId    — id SC трека если недоступен (2.2с, затем null)
artEntranceKey  — счётчик, инкремент → ремаунт обёртки AlbumArt → artEntrance анимация
artistView      — null | { id?, username, avatarUrl?, followersCount?, bannerUrl? }
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
slideWrapRef              — ref на обёртку обложки в плеере (GSAP track slide)
playerInfoRef             — ref на блок артист+название в плеере (GSAP анимация входа)
trackDirRef               — 'next'|'prev' — направление для GSAP track slide
slideReadyRef             — пропускает первый mount в track slide эффекте
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
prevViewRef               — view из которого открылся ArtistView (для handleCloseArtist)
customTitlesRef, minDurationRef, editCancelRef
```

### `App` — helpers

- **`startFadeIn(audio)`** — отменяет текущий rAF, если `crossfade>0` устанавливает `audio.volume=0` и rAF-анимацию до `volumeRef.current` за N сек; иначе просто восстанавливает volume
- **`destroyHls()`** — уничтожает hls.js инстанс и обнуляет `hlsRef`
- **`showToast(msg)`** — показывает тост 2.2с, затем fade-out 0.24с, затем убирает из DOM
- **`handleSearchResultsLoaded(newTracks)`** — вызывается из `SearchView.onResultsLoaded`; дописывает треки в `searchQueueRef`, дошафливает в конец `scShuffleOrderRef` если shuffle активен
- **`handleOpenArtist(artist)`** — сохраняет `prevViewRef.current = view`, устанавливает `artistView`, `view='artist'`
- **`handleCloseArtist()`** — возвращает к `prevViewRef.current` (search/player/home)

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
  artistId,          // SC user id аплоадера (для открытия профиля)
  artistAvatarUrl,   // аватарка аплоадера
  uploaderUsername,  // username аплоадера (для splitArtists matching)
  likesCount,        // кол-во лайков трека
  playCount,         // кол-во прослушиваний
  streamUrl,         // progressive endpoint (может быть null)
  hlsUrl,            // HLS endpoint (может быть null)
  resolvedUrl,       // только у scPlayingTrack — финальный CDN URL
}
```

### `App` — имя артиста в плеере

`splitArtists(track.artist)` разбивает строку на `[{name, sep}]`. каждый `name` — отдельный кликабельный спан.
- если `name.toLowerCase() === track.uploaderUsername.toLowerCase()` → `handleOpenArtist({ id: track.artistId, username: name, avatarUrl: track.artistAvatarUrl })`
- иначе → `handleOpenArtist({ username: name })` (ArtistView сам найдёт через поиск)

### `App` — Discord RPC

useEffect зависит от `[track?.id, isPlaying, settings.discordRpc, settings.discordTimestamp, settings.discordPause, settings.discordCover]`.
- `discordRpc=false` или `!track` → `discordClear`
- `discordPause='hide'` и `!isPlaying` → `discordClear`
- иначе → `discordUpdate({ title, artist, duration, progress, coverUrl, isPlaying, timestamp })`

`timestamp` в main.js: `'progress'` → start+end (progress bar), `'elapsed'` → только start, `'none'` → без timestamp.

### `App` — лейаут плеера

центральный блок (flex column, alignItems:center):
- `width: 'calc(100% - 48px)', maxWidth: clamp(380px, 55vw, 900px)` — адаптивный контейнер
- **порядок**: `playerInfoRef` (артист→название) → обложка (`slideWrapRef`) → прогресс-бар → кнопки
- **артист**: `fontSize: clamp(12px, 1.5vw, 16px)`
- **название**: `fontSize: clamp(18px, 2.6vw, 28px)`, `maxWidth: min(clamp(280px, 38vw, 520px), 88%)`
- **обложка**: `width: min(100%, clamp(320px, 54vw, 760px), clamp(240px, 58vh, 760px))` — масштабируется по ширине И высоте
- **прогресс-бар**: `width: min(100%, clamp(260px, 34vw, 520px))`
- **библиотека**: внутренний `width:260px` fixed wrapper предотвращает reflow при анимации collapse

### `App` — анимации

- **home→player**: HeroClone GSAP `sine.inOut` 0.42s + `playerInfoRef` fade+slide (`sine.out` 0.42s delay 0.08s)
- **player→home**: reverse HeroClone GSAP `sine.inOut` 0.38s
- **смена трека**: GSAP `fromTo` на `slideWrapRef` (`y: ±14 → 0`, `power2.out` 0.5s); направление из `trackDirRef`
- **SC логин**: AvatarFlyClone 440мс
- **artEntrance**: при `view→'player'` без hero → `artEntranceKey++` → `scale(0.86)→scale(1) + opacity 0→1`, 420мс
- **библиотека**: появление `opacity 0.36s ease 0.1s, transform 0.44s ... 0.1s`
- **тост**: `fadeInUp 0.18s` → через 2.2с `fadeOutDown 0.24s` → убирается из DOM

### рендер
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
```
