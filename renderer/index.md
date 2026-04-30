# карта renderer/index.html

весь ui — один файл ~1531 строк. jsx компилируется babel standalone в браузере.

## структура файла

| строки    | что                                                        |
|-----------|------------------------------------------------------------|
| 1–68      | `<head>`: cdn-скрипты, css (`:root` vars, анимации, titlebar, scrollbar) |
| 69–83     | `#app-shell` + `#titlebar` html: wrapper с border-radius + кнопки minimize/maximize/close |
| 85–1528   | `<script type="text/babel">`: весь react                   |

## css-переменные (строка 14)

```css
--bg: #07070a   --border: rgba(255,255,255,0.055)
--text: #ededf4   --accent: #b2b2b2   --titlebar-h: 28px
```

глобально: `*, *::before, *::after { user-select: none }` — текст не выделяется.

анимации: `breathe` (масштаб+opacity), `spin` (360°)

## утилиты

**строка 86** — деструктура: `{ useState, useEffect, useRef, useCallback, useMemo }`  
**строка 88** — `smoothScroll(el, targetTop, duration)` — плавный скролл с easing `easeInOutQuad`  
**строка 102** — `DEMO_TRACKS`: статичный массив 8 объектов `{id, title, artist, duration (сек), color (hex)}`  
**строка 113** — `fmt(s)` → строка `M:SS`

## компоненты (по порядку в файле)

### `useMagnet(strength=0.25, { spring=0.10, damping=0.74, clamp=12 }={})` — строки 119–163
hook. возвращает `{ref, xy, onMove, onLeave}`.  
физика: spring/damping/clamp настраиваемые через второй аргумент. rAF-петля всегда крутится.  
player-кнопки используют `{ spring:0.055, damping:0.84, clamp:10 }` — мягче и инертнее.

### `WaveProgressBar` — строки 166–290
пропсы: `{progress [0–1], elapsed, total, onSeek(v), isPlaying}`  
canvas-волна H=52. плавная анимация без случайных beat-спайков. drag по всей ширине → onSeek.

### `ThinVolumeSlider` — строки 291–405
пропсы: `{volume [0–1], onChange(v)}`  
canvas TW=28px, вертикальный. drag вверх = больше. onChange вызывается в реальном времени на каждом mousemove.

### `AlbumArt` — строки 406–450
пропсы: `{track, isPlaying}`  
если `track.coverUrl` — показывает `<img>`. иначе: blur-blob, svg-кольца, spinning disc.

### `MagBtn` — строки 451–471
пропсы: `{onClick, active, children, size=52, physics}`  
круглая кнопка с useMagnet(0.28, physics).

### `PlayBtn` — строки 473–499
пропсы: `{isPlaying, onToggle, physics}`  
кнопка 66px, useMagnet(0.18, physics). pause: два скруглённых бара (rx=2.25). play: треугольник path.

### `NavIcon` — строки 507–527
пропсы: `{icon, label, active, onClick, size=38}`  
кнопка сайдбара 38px, useMagnet(0.22).

### `TrackRow` — строки 528–560
пропсы: `{track, isActive, onClick}`  
строка библиотеки: миниатюра 34px + title/artist + duration. высота фиксированная ~50px.  
фон active убран — его рисует пилл в `VirtualTrackList`. `position:relative, zIndex:1` чтобы быть поверх пилла.

### `VirtualTrackList` — строки 561–604
пропсы: `{items, activeId, onClickItem}`  
виртуализированный список: рендерит только видимые строки + 4 буфера. ROW_H=50.  
содержит абсолютно позиционированный «пилл» — `top: activeIdx * ROW_H + 2`, CSS transition `0.42s cubic-bezier(0.22,1,0.36,1)`. при смене трека плавно съезжает к новой строке.

### `HomeCard` — строки 605–664
пропсы: `{track, onClick, artRef, artHidden}`  
карточка сетки. useMagnet(0.18). `artRef` — ref на div-обложку (для HeroClone). `artHidden` — скрывает обложку во время reverse-hero.

### `HeroClone` — строки 665–734
пропсы: `{hero: {track, startRect, targetRect: {left,top,size}}, exiting, reverse=false}`  
ReactDOM.createPortal → document.body. CSS transition 340ms.  
`reverse=false` (home→player): стартует с карточки, летит к AlbumArt.  
`reverse=true` (player→home): стартует с AlbumArt, летит к карточке.

### `Sidebar` — строки 735–784
пропсы: `{navActive, onNav, libCollapsed, onToggleLib, inPlayer}`  
левая панель 58px. две кнопки навигации: **Треки** (id:`home`) и **Плеер** (id:`library`) + настройки внизу.

### `CrossfadeSlider` — строки 785–833
пропсы: `{value [0–12], onChange(v)}`  
горизонтальный слайдер кроссфейда 0–12 сек.

### `SettingsView` — строки 834–998
пропсы: `{settings, onSettings, visible, onScanTracks}`  
секции: playback / system / about.

### `App` — строки 999–1538

**state:**
```
view             'home'|'player'|'settings'
tracks           DEMO_TRACKS | локальные треки
trackIdx         0
isPlaying        false
progress         0–1
shuffle          false
repeat           'off'|'all'|'one'
navActive        'home'
search           ''
volume           0.7
hero             null | {track, startRect, targetRect}
playerVisible    false
homeVisible      true
heroExiting      false
reverseHero      null | {track, startRect, targetRect}
reverseHeroExiting false
libCollapsed     false
settings         {autoplay, crossfade, defaultRepeat, startWithWindows, minimizeToTray, musicFolder}
sort             'added'|'artist'|'title'|'duration'
editingTitle     false
editValue        ''
```
`settings.customTitles` — `{ [path]: title }` — кастомные названия треков, хранятся в settings.json
```
```

**refs:**
```
artRefs        {}   — ref на каждую HomeCard обложку (по origIdx в tracks)
playerArtRef   null — ref на AlbumArt в PlayerView
audioRef       null — HTML5 Audio объект
handleNextRef  null — актуальная ссылка на handleNext
handlePrevRef  null — актуальная ссылка на handlePrev
isPlayingRef   bool — синхронизируется inline в теле компонента
homeScrollRef  null — ref на скролл-контейнер домашнего грида
editCancelRef  bool — флаг отмены редактирования (Escape)
```

**useEffect-ы (аудио):**
- монтирование: создаёт `new Audio()`, вешает `timeupdate` → setProgress, `ended` → handleNextRef
- `[trackIdx, track?.path]`: обновляет `audio.src`, `audio.load()`, `loadedmetadata` → duration; если `isPlayingRef.current` — сразу `audio.play()`
- `[isPlaying]`: `audio.play()` / `audio.pause()`
- `[volume]`: `audio.volume = volume`
- `[]` медиаклавиши: `onMediaPlayPause/Next/Prev` через `window.electronAPI`

**useEffect-ы (данные):**
- монтирование: `loadSettings()` → восстанавливает settings + сканирует musicFolder + `loadCovers`
- `[settings]`: `saveSettings(settings)`
- `[trackIdx]`: сбрасывает `editingTitle` в false

**ключевые функции:**
- `handleNext()` — строка 1108: repeat='one'→ loop; shuffle→ random; конец списка: repeat='all'→ start, repeat='off'→ stop
- `handlePrev()` — строка 1129: если progress>5% → rewind, иначе предыдущий трек
- `handleSeek(v)` — строка 1140
- `commitEdit()` — строка 1148: сохраняет отредактированное название в tracks state
- `loadCovers(tracksArr)` — строка 1155: 16 воркеров параллельно, flush каждые 16 готовых обложек
- `handleScanTracks(folder)` — строка 1184
- `selectTrack(idx)` — строка 1197: hero-анимация home→player
- `sortedTracks` — строка 1218: useMemo, сортирует tracks по sort state
- `trackIdxMap` — строка 1226: useMemo, Map id→origIdx для O(1) lookup
- `filtered` — строка 1232: sortedTracks фильтрованные по search
- `handleNav(id)` — строка 1238: смена view; при player→home запускает smoothScroll + корректирует startRect на -28px (компенсация translateX home-контейнера)

**layout:**
```
Sidebar(58px) | LibraryPanel(260px) | CenterPlayer(flex:1) | VolumeSlider(28px)
```

**анимации переходов:**
- home→player: home-контейнер уходит вправо (`translateX(28px)`), library panel въезжает слева (`translateX(-28px)`) с задержкой 80мс, title/artist блок fade+slide снизу с задержкой 120мс
- player→home: home-контейнер въезжает справа (`translateX(28px)`→0) с задержкой 80мс
- HeroClone летит 340мс; при reverse startRect.left скорректирован на -28px

**редактирование названия:**
- shift+click на title в плеере → `editingTitle=true`, появляется frosted контейнер с `<input>`
- Enter/blur → `commitEdit()` сохраняет в `tracks` state и в `settings.customTitles[track.path]`; Escape → отмена (`editCancelRef=true`)
- при старте и пересканировании кастомные названия применяются из `settings.customTitles` поверх исходных

**сортировка треков:**
- кнопки над home-гридом: по дате / артисту / названию / длине
- `sortedTracks` используется и в home-гриде и в sidebar (через `filtered`)
- `artRefs` индексируются по origIdx (позиция в несортированном `tracks`) — hero-анимация не ломается

**repeat (3 состояния):**
- `'off'` — играет список, стоп в конце
- `'all'` — повторяет список по кругу
- `'one'` — зацикливает текущий трек; иконка показывает пилл "1" в правом верхнем углу

### рендер (строка 1539)
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
```
