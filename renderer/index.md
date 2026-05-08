# карта renderer/index.html

весь ui — один файл ~2700 строк. jsx компилируется babel standalone в браузере.

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
- `SoundCloudIcon({ size, fill })` — инлайн SVG логотип SC
- `scHashColor(id)` → `hsl(...)` по id трека

## компоненты

### `WaveProgressBar`
пропсы: `{progress, elapsed, total, onSeek, isPlaying, visible}`
canvas-волна H=52. drag → onSeek. анимация замораживается на паузе. rAF останавливается при `visible=false`.

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
**перереализован**: drag через `setPointerCapture` (onPointerDown/Move/Up) — надёжнее window-listeners. wheel (passive:false). визуал: 6px трек без thumb, `#c8c8c8` fill с glow, hit-зона 24px.

### `SettingsView`
пропсы: `{settings, onSettings, visible, onScanTracks, onClearFolder}`
секции: `playback`→`vosproizvedenie.png`, `system`→`system.png`, `about`→`about.png`.

### `AvatarFlyClone`
portal-анимация аватара (SoundCloudView → Sidebar), 440мс.

### `SoundCloudView`, `SearchTrackRow`, `SearchView`
без изменений по сравнению с предыдущей версией.

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
settingsRef               — синхронизируется каждый рендер (для crossfade)
crossfadeRafRef           — rAF handle для fade-in/fade-out анимации громкости
toastTimerRef             — таймер скрытия тоста
discordTimerRef, discordProgressRef
prevSearchRef, homeSearchRef, libSearchRef
customTitlesRef, minDurationRef, editCancelRef
```

### `App` — helpers

- **`startFadeIn(audio)`** — отменяет текущий rAF, если `crossfade>0` устанавливает `audio.volume=0` и rAF-анимацию до `volumeRef.current` за N сек; иначе просто восстанавливает volume
- **`destroyHls()`** — уничтожает hls.js инстанс и обнуляет `hlsRef`
- **`showToast(msg)`** — показывает тост 2.2с, затем fade-out 0.24с, затем убирает из DOM

### `App` — crossfade (локальные треки и SC)

- **fade-out**: в `timeupdate` — если `remaining <= crossfade`, `audio.volume = volume * (remaining/crossfade)`; seek восстанавливает volume
- **fade-in**: `startFadeIn(audio)` вызывается перед `audio.play()` при смене трека (local useEffect) и в `handleScTrackClick`
- **пауза**: при `isPlaying=false` — отменяет rAF + восстанавливает `audio.volume = volumeRef.current`

### `App` — handleScTrackClick

1. `setLoadingTrackId(scTrack.id)` — спиннер в TrackRow
2. fetch `streamUrl` → если 404/error → fetch `hlsUrl` (fallback)
3. если оба недоступны → `showToast('трек недоступен')`, `setLoadingTrackId(null)`
4. `setScPlayingTrack(resolved)`
5. если HLS (`!streamUrl && hlsUrl`) → hls.js: `loadSource` → `attachMedia` → `MANIFEST_PARSED` → play
6. иначе progressive → `audio.src` → play
7. `startFadeIn(audio)` перед play в обоих случаях
8. `setLoadingTrackId(null)` в `.then()` от `audio.play()` — спиннер гаснет только при реальном старте воспроизведения

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
