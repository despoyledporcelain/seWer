# карта renderer/index.html

весь ui — один файл ~1860 строк. jsx компилируется babel standalone в браузере.

## структура файла

| строки    | что                                                        |
|-----------|------------------------------------------------------------|
| 1–76      | `<head>`: cdn-скрипты, css (`:root` vars, `#app-shell`, titlebar, scrollbar) |
| 77–93     | `#app-shell` + `#titlebar` html: wrapper с border-radius + кнопки minimize/maximize/close |
| 94–1859   | `<script type="text/babel">`: весь react                   |

## css-переменные (строка 14)

```css
--bg: #07070a   --border: rgba(255,255,255,0.055)
--text: #ededf4   --accent: #b2b2b2   --titlebar-h: 28px
```

**`#app-shell`** — `position:fixed; inset:0; border-radius:12px; overflow:hidden; display:flex; flex-direction:column` — единственный визуальный контейнер окна; режет все дочерние элементы по скруглению. `#titlebar` — flex-child внутри него (не fixed).

глобально: `*, *::before, *::after { user-select: none }` — текст не выделяется.  
`input[type=number]` — спинеры скрыты через `-webkit-appearance:none`.

шрифт: **Proxima Soft** (локальный, `renderer/fonts/ProximaSoft-Bold.ttf`, подключён через `@font-face`).

анимации: `breathe` (масштаб+opacity), `spin` (360°)

## утилиты

**строка 97** — `smoothScroll(el, targetTop, duration)` — плавный скролл с easing `easeInOutQuad`  
**строка 113** — `DEMO_TRACKS`: статичный массив 8 объектов `{id, title, artist, duration (сек), color (hex)}`  
**строка 122** — `fmt(s)` → строка `M:SS`  
**строка 127** — `SoundCloudIcon({ size=16, fill='currentColor' })` — настоящий логотип SC из `assets/icon.svg`, инлайн SVG с viewBox `-271 345.8 256 111.2`  
**строка 148** — `scHashColor(id)` → `hsl(...)` по числовому id трека

## компоненты (по порядку в файле)

### `WaveProgressBar` — строки 156–279
пропсы: `{progress [0–1], elapsed, total, onSeek(v), isPlaying}`  
canvas-волна H=52. плавная анимация без случайных beat-спайков. drag по всей ширине → onSeek.

### `ThinVolumeSlider` — строки 281–394
пропсы: `{volume [0–1], onChange(v)}`  
canvas TW=28px, вертикальный. drag вверх = больше. onChange вызывается в реальном времени на каждом mousemove.

### `AlbumArt` — строки 396–418
пропсы: `{track, isPlaying}`  
если `track.coverUrl` — только `<img>`, никаких фоновых слоёв. иначе: нейтральный `#111116` + иконка ноты (svg, opacity 0.13).

### `MagBtn` — строки 441–458
пропсы: `{onClick, active, children, size=52}`  
круглая кнопка. press-scale 0.83.

### `PlayBtn` — строки 460–489
пропсы: `{isPlaying, onToggle}`  
кнопка 66px. press-scale 0.89.

### `NavIcon` — строки 491–506
пропсы: `{icon, label, active, onClick, size=38}`  
кнопка сайдбара 38px.

### `TrackRow` — строки 472–503
пропсы: `{track, isActive, onClick}`  
строка библиотеки: миниатюра 34px + title/artist + duration. высота ~50px.  
фон active рисует пилл в `VirtualTrackList`. `position:relative, zIndex:1` чтобы быть поверх пилла. фон миниатюры — нейтральный `#111116`.

### `VirtualTrackList` — строки 541–596
пропсы: `{items, activeId, onClickItem, scrollToActive}`  
виртуализированный список: рендерит только видимые строки + 4 буфера. ROW_H=50.  
содержит абсолютно позиционированный «пилл» — `top: activeIdx * ROW_H + 2`, CSS transition `0.42s cubic-bezier(0.22,1,0.36,1)`.  
`scrollToActive` — числовой триггер: при изменении скроллит список к активному треку (центрирует).

### `HomeCard` — строки 549–604
пропсы: `{track, onClick, artRef, artHidden}`  
карточка сетки. hover-scale 1.03. `artRef` — ref на div-обложку (для HeroClone). `artHidden` — скрывает обложку во время reverse-hero. фон art-div всегда `#111116`; заглушка — иконка ноты (svg).

### `HeroClone` — строки 608–658
пропсы: `{hero: {track, startRect, targetRect: {left,top,size}}, exiting, reverse=false}`  
ReactDOM.createPortal → document.body. CSS transition 340ms. фон `#111116`; если `coverUrl` — только img; иначе — иконка ноты.

### `Sidebar` — строки 712–765
пропсы: `{navActive, onNav, libCollapsed, onToggleLib, inPlayer, scAuth, profileRef}`  
левая панель 58px. три кнопки навигации: **Треки** (`home`), **Плеер** (`library`), **SoundCloud** (`soundcloud`) + настройки внизу.  
`profileRef` — ref на иконку профиля (для анимации аватара). если `scAuth?.avatarUrl` — показывает аватар вместо svg-заглушки.

### `CrossfadeSlider` — строки 767–814
пропсы: `{value [0–12], onChange(v)}`  
горизонтальный слайдер кроссфейда 0–12 сек.

### `SettingsView` — строки 816–1002
пропсы: `{settings, onSettings, visible, onScanTracks}`  
секции: playback / system / about.

### `AvatarFlyClone` — строки 1004–1026
пропсы: `{fly: {avatarUrl, startRect, targetRect}, exiting}`  
portal-анимация: аватар летит из 72px блока в SoundCloudView в 40px иконку профиля сайдбара. та же механика что у HeroClone (позиция на targetRect, transform в startRect, transition к identity).

### `SoundCloudView` — строки 1028–1110
пропсы: `{visible, scAuth, onLogin, onLogout, avatarRef, scTracks, scLoading, scError, onReload, onScTrackClick, scPlayingId}`  
два состояния:
- **не залогинен**: центрированный экран с `SoundCloudIcon` + кнопка «войти через браузер»; `avatarRef` на контейнер иконки (стартовая точка анимации)
- **залогинен**: шапка «лайки» + счётчик + кнопка «выйти» + `VirtualTrackList` с SC-треками; `onScTrackClick(t, idx)` при клике

### `App` — строки 1113–1858

**state:**
```
view               'home'|'player'|'settings'|'soundcloud'
tracks             DEMO_TRACKS | локальные треки
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
                    musicFolder, customTitles, minDuration, soundcloudAuth}
sort               'added'|'artist'|'title'|'duration'
editingTitle       false
editValue          ''
scTracks           [] — лайки SC
scLoading          false
scError            null | string
scPlayingTrack     null | {id, title, artist, duration, color, coverUrl, streamUrl, resolvedUrl}
scPlayingIdx       -1 | number — индекс в scTracks
```

`settings.soundcloudAuth` — `{ token, clientId, userId, username, avatarUrl }` — хранится в settings.json  
`track` — вычисляется как `scPlayingTrack || tracks[trackIdx] || tracks[0]`

**refs:**
```
artRefs          {}   — ref на каждую HomeCard обложку (по origIdx в tracks)
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
- `[settings.soundcloudAuth]`: если токен есть → `loadScLikes(auth)`; иначе → `setScTracks([])`

**ключевые функции:**
- `handleNext()` — строка 1256: в SC режиме (`scPlayingTrack`) — следующий трек в `scTracks`; иначе обычная логика (repeat/shuffle/local)
- `handlePrev()` — строка 1285: в SC режиме — предыдущий в `scTracks`; иначе rewind или предыдущий local
- `handleSeek(v)` — строка 1301
- `commitEdit()` — сохраняет кастомное название в `tracks` state и `settings.customTitles`
- `loadCovers(tracksArr)` — 16 воркеров параллельно, base64 обложки для локальных файлов
- `handleScanTracks(folder)` — строка 1350: сканирует папку
- `loadScLikes(auth)` — строка 1365: пагинированная загрузка лайков SC (`users/{userId}/likes?limit=200`), до 20 страниц; после загрузки: `scCheckCovers` для уже кэшированных, затем `loadScCovers` фоном
- `loadScCovers(tracksArr)` — строка 1416: 6 воркеров, скачивает обложки в `%AppData%\seWer\sc_covers\{id}.jpg`, flush каждые 20
- `handleScLogin(auth)` — строка 1447: сохраняет auth в settings, запускает анимацию аватара (`AvatarFlyClone`)
- `handleScLogout()` — строка 1459: очищает `soundcloudAuth` из settings
- `handleScTrackClick(scTrack, idx)` — строка ~1461: резолвит stream URL через `sc-fetch`, ставит `audio.src`, навигирует в player, запускает воспроизведение
- `selectTrack(idx)` — строка 1490: hero-анимация home→player; сбрасывает `scPlayingTrack`
- `sortedTracks` — строка 1512: useMemo, сортирует local tracks
- `filtered` — строка 1526: sortedTracks фильтрованные по search
- `handleNav(id)` — строка 1532: смена view; поддерживает `soundcloud` как отдельный view

**layout:**
```
Sidebar(58px) | LibraryPanel(260px) | CenterPlayer(flex:1) | VolumeSlider(28px)
```

library panel показывает:
- SC треки (`scTracks` фильтрованные по `search`) когда `scPlayingTrack` активен
- локальные (`filtered`) в остальных случаях

**SC трек-объект:**
```js
{
  id, title, artist, duration,
  color,       // scHashColor(id)
  coverUrl,    // URL CDN или file:// после кэша
  streamUrl,   // api-v2 endpoint для резолва
  resolvedUrl, // только у scPlayingTrack — финальный CDN audio URL
}
```

**анимации:**
- home→player: HeroClone 340мс
- player→home: reverse HeroClone
- SC логин: AvatarFlyClone 440мс (avatarRef → sidebarProfileRef)

### рендер (строка 1859)
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
```
