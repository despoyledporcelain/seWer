# карта renderer/index.html

весь ui — один файл ~1556 строк. jsx компилируется babel standalone в браузере.

## структура файла

| строки    | что                                                        |
|-----------|------------------------------------------------------------|
| 1–66      | `<head>`: cdn-скрипты, css (`:root` vars, `#app-shell`, titlebar, scrollbar) |
| 67–93     | `#app-shell` + `#titlebar` html: wrapper с border-radius + кнопки minimize/maximize/close |
| 94–1600+  | `<script type="text/babel">`: весь react                   |

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

**строка 95** — деструктура: `{ useState, useEffect, useRef, useCallback, useMemo }`  
**строка 97** — `smoothScroll(el, targetTop, duration)` — плавный скролл с easing `easeInOutQuad`  
**строка 111** — `DEMO_TRACKS`: статичный массив 8 объектов `{id, title, artist, duration (сек), color (hex)}`  
**строка 122** — `fmt(s)` → строка `M:SS`

## компоненты (по порядку в файле)

### `WaveProgressBar` — строки 129–252
пропсы: `{progress [0–1], elapsed, total, onSeek(v), isPlaying}`  
canvas-волна H=52. плавная анимация без случайных beat-спайков. drag по всей ширине → onSeek.

### `ThinVolumeSlider` — строки 254–367
пропсы: `{volume [0–1], onChange(v)}`  
canvas TW=28px, вертикальный. drag вверх = больше. onChange вызывается в реальном времени на каждом mousemove.

### `AlbumArt` — строки 369–412
пропсы: `{track, isPlaying}`  
если `track.coverUrl` — показывает `<img>`. иначе: blur-blob, svg-кольца, spinning disc.

### `MagBtn` — строки 414–431
пропсы: `{onClick, active, children, size=52}`  
круглая кнопка. press-scale 0.83. (магнитная физика удалена)

### `PlayBtn` — строки 433–462
пропсы: `{isPlaying, onToggle}`  
кнопка 66px. press-scale 0.89. pause: два скруглённых бара. play: треугольник path. (магнитная физика удалена)

### `NavIcon` — строки 464–479
пропсы: `{icon, label, active, onClick, size=38}`  
кнопка сайдбара 38px. (магнитная физика удалена)

### `TrackRow` — строки 481–512
пропсы: `{track, isActive, onClick}`  
строка библиотеки: миниатюра 34px + title/artist + duration. высота фиксированная ~50px.  
фон active убран — его рисует пилл в `VirtualTrackList`. `position:relative, zIndex:1` чтобы быть поверх пилла.

### `VirtualTrackList` — строки 514–556
пропсы: `{items, activeId, onClickItem}`  
виртуализированный список: рендерит только видимые строки + 4 буфера. ROW_H=50.  
содержит абсолютно позиционированный «пилл» — `top: activeIdx * ROW_H + 2`, CSS transition `0.42s cubic-bezier(0.22,1,0.36,1)`. при смене трека плавно съезжает к новой строке.

### `HomeCard` — строки 558–613
пропсы: `{track, onClick, artRef, artHidden}`  
карточка сетки. hover-scale 1.03. `artRef` — ref на div-обложку (для HeroClone). `artHidden` — скрывает обложку во время reverse-hero. (магнитная физика удалена)

### `HeroClone` — строки 615–683
пропсы: `{hero: {track, startRect, targetRect: {left,top,size}}, exiting, reverse=false}`  
ReactDOM.createPortal → document.body. CSS transition 340ms.  
`reverse=false` (home→player): стартует с карточки, летит к AlbumArt.  
`reverse=true` (player→home): стартует с AlbumArt, летит к карточке.

### `Sidebar` — строки 685–733
пропсы: `{navActive, onNav, libCollapsed, onToggleLib, inPlayer}`  
левая панель 58px. три кнопки навигации: **Треки** (id:`home`), **Плеер** (id:`library`), **SoundCloud** (id:`soundcloud`) + настройки внизу.

### `CrossfadeSlider` — строки 735–782
пропсы: `{value [0–12], onChange(v)}`  
горизонтальный слайдер кроссфейда 0–12 сек.

### `SoundCloudView` — после SettingsView
пропсы: `{visible}`  
заглушка экрана soundcloud: иконка + текст «soundcloud не подключён» + кнопка «войти через браузер» (пока без логики). оранжевый акцент `#ff5500`. управляется через `visible={view==='soundcloud'}` аналогично SettingsView.

### `SettingsView` — строки 784–970
пропсы: `{settings, onSettings, visible, onScanTracks}`  
секции: playback / system / about.  
в секции «Система → Локальная музыка»: выбор папки + инпут «Мин. длительность аудиофайлов» (number, сек, default 30).

### `App` — строки 972–1552

**state:**
```
view             'home'|'player'|'settings'|'soundcloud'
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
settings         {autoplay, crossfade, defaultRepeat, startWithWindows, minimizeToTray, musicFolder, customTitles, minDuration}
sort             'added'|'artist'|'title'|'duration'
editingTitle     false
editValue        ''
```
`settings.customTitles` — `{ [path]: title }` — кастомные названия треков, хранятся в settings.json  
`settings.minDuration` — минимальная длительность (сек) для сканирования, default 30

**refs:**
```
artRefs          {}   — ref на каждую HomeCard обложку (по origIdx в tracks)
playerArtRef     null — ref на AlbumArt в PlayerView
audioRef         null — HTML5 Audio объект
handleNextRef    null — актуальная ссылка на handleNext
handlePrevRef    null — актуальная ссылка на handlePrev
isPlayingRef     bool — синхронизируется inline в теле компонента
homeScrollRef    null — ref на скролл-контейнер домашнего грида
editCancelRef    bool — флаг отмены редактирования (Escape)
customTitlesRef  {}   — синхронизируется с settings.customTitles; используется в handleScanTracks
minDurationRef   30   — синхронизируется с settings.minDuration; используется в handleScanTracks
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
- `handleNext()` — строка 1101: repeat='one'→ loop; shuffle→ random; конец списка: repeat='all'→ start, repeat='off'→ stop
- `handlePrev()` — строка 1122: если progress>5% → rewind, иначе предыдущий трек
- `handleSeek(v)` — строка 1133
- `commitEdit()` — строка 1141: сохраняет название в `tracks` state и в `settings.customTitles[track.path]`
- `loadCovers(tracksArr)` — строка 1153: 16 воркеров параллельно, flush каждые 16 готовых обложек
- `handleScanTracks(folder)` — строка 1182: сканирует папку с `minDurationRef.current`, применяет `customTitlesRef.current` поверх исходных названий
- `selectTrack(idx)` — строка 1197: hero-анимация home→player
- `sortedTracks` — строка 1218: useMemo, сортирует tracks по sort state
- `trackIdxMap` — строка 1226: useMemo, Map id→origIdx для O(1) lookup
- `filtered` — строка 1232: sortedTracks фильтрованные по search; используется и в home-гриде и в sidebar
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

**поиск треков:**
- инпут в хедере home view между заголовком «Все треки» и кнопками сортировки
- `filtered` = sortedTracks фильтрованные по `search` (title + artist, case-insensitive)
- крестик для сброса поиска появляется при непустом `search`

**сортировка треков:**
- кнопки над home-гридом: по дате / артисту / названию / длине
- `sortedTracks` используется и в home-гриде (через `filtered`) и в sidebar
- `artRefs` индексируются по origIdx (позиция в несортированном `tracks`) — hero-анимация не ломается

**repeat (3 состояния):**
- `'off'` — играет список, стоп в конце
- `'all'` — повторяет список по кругу
- `'one'` — зацикливает текущий трек; иконка показывает пилл "1" в правом верхнем углу

### рендер (строка 1553)
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
```
