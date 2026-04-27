# карта renderer/index.html

весь ui — один файл ~1310 строк. jsx компилируется babel standalone в браузере.

## структура файла

| строки    | что                                                        |
|-----------|------------------------------------------------------------|
| 1–68      | `<head>`: cdn-скрипты, css (`:root` vars, анимации, titlebar, scrollbar) |
| 70–82     | `#titlebar` html: кнопки minimize/maximize/close через `window.electronAPI` |
| 85–1309   | `<script type="text/babel">`: весь react                   |

## css-переменные (строка 14)

```css
--bg: #07070a   --border: rgba(255,255,255,0.055)
--text: #ededf4   --accent: #b2b2b2   --titlebar-h: 28px
```

анимации: `breathe` (масштаб+opacity), `spin` (360°)

## данные

**строки 88–97** — `DEMO_TRACKS`: статичный массив 8 объектов `{id, title, artist, duration (сек), color (hex)}` — используется как fallback пока не выбрана локальная папка  
**строка 99** — `fmt(s)` → строка `M:SS`

## компоненты (по порядку в файле)

### `useMagnet(strength=0.25)` — строки 105–149
hook. возвращает `{ref, xy, onMove, onLeave}`.  
применение: `ref` на элемент, `onMouseMove={onMove}`, `onMouseLeave={onLeave}`, `transform: translate(${xy.x}px,${xy.y}px)`.  
физика: SPRING=0.10, DAMPING=0.74, CLAMP=12px. rAF-петля всегда крутится.

### `WaveProgressBar` — строки 152–273
пропсы: `{progress [0–1], elapsed, total, onSeek(v), isPlaying}`  
canvas-волна H=52. beat-эффект: случайный импульс при isPlaying, затухает. drag по всей ширине → onSeek. onSeek вызывается и при drag (mousemove), и при click.

### `ThinVolumeSlider` — строки 276–388
пропсы: `{volume [0–1], onChange(v)}`  
canvas TW=28px, вертикальный. drag вверх = больше. onChange вызывается только на mouseUp. анимирует толщину трека (2→4px) и ручку (3.5→6px) при нажатии.

### `AlbumArt` — строки 391–434
пропсы: `{track, isPlaying}`  
если `track.coverUrl` — показывает `<img>` (objectFit:cover). иначе: размытый blur-blob фона (track.color), svg-кольца, spinning disc (animation: spin 9s). breathe на blob при isPlaying.

### `MagBtn` — строки 436–455
пропсы: `{onClick, active, children, size=52}`  
круглая кнопка с useMagnet(0.28). цвет: active → `--accent`, иначе rgba(255,255,255,0.38). scale(0.83) при нажатии.

### `PlayBtn` — строки 458–484
пропсы: `{isPlaying, onToggle}`  
большая кнопка 82px, useMagnet(0.18). svg play/pause inline.

### `NavIcon` — строки 487–505
пропсы: `{icon, label, active, onClick, size=38}`  
кнопка сайдбара 38px, useMagnet(0.22). active → bg rgba(178,178,178,0.11).

### `TrackRow` — строки 508–538
пропсы: `{track, isActive, onClick}`  
строка библиотеки: миниатюра 34px + title/artist + duration. hover-фон.  
миниатюра: если `track.coverUrl` — `<img>`, иначе svg-треугольник play.

### `HomeCard` — строки 541–598
пропсы: `{track, onClick, artRef, artHidden}`  
карточка сетки. useMagnet(0.18), scale(1.03) при hover. `artRef` — ref на div-обложку (нужен для HeroClone). `artHidden` — скрывает обложку во время reverse-hero анимации. overlay-play при hover.  
если `track.coverUrl` — `<img>` вместо svg-градиента.

### `HeroClone` — строки 601–668
пропсы: `{hero: {track, startRect, targetRect: {left,top,size}}, exiting, reverse=false}`  
ReactDOM.createPortal → document.body. CSS transition 340ms cubic-bezier.  
`reverse=false` (home→player): стартует с позиции карточки, летит к AlbumArt.  
`reverse=true` (player→home): стартует с AlbumArt, летит к карточке.  
`exiting` → opacity:0 (fadeout перед удалением).  
если `hero.track.coverUrl` — показывает `<img>` вместо svg-заглушки.

### `Sidebar` — строки 671–720
пропсы: `{navActive, onNav, libCollapsed, onToggleLib, inPlayer}`  
левая панель 58px. иконки: home/library/liked/search + settings внизу. все через NavIcon.  
если `inPlayer=true` — показывает кнопку свернуть/развернуть библиотеку (scaleX анимация).

### `CrossfadeSlider` — строки 723–769
пропсы: `{value [0–12], onChange(v)}`  
горизонтальный слайдер кроссфейда 0–12 сек. кастомный drag. используется только внутри SettingsView.

### `SettingsView` — строки 772–934
пропсы: `{settings, onSettings, visible, onScanTracks}`  
макет: левая навигация 214px (секции: playback/system/about) + правый контент с карточками.  
внутренние компоненты: `Toggle`, `Row`, `Card`. локальный стейт `sec` — активная секция.  
**секция system** содержит карточку "Локальная музыка" с кнопкой "Выбрать" — вызывает `window.electronAPI.selectMusicFolder()`, сохраняет путь в `settings.musicFolder`, вызывает `onScanTracks(folder)`.

### `App` — строки 937–1307

**state:**
```
view             'home'|'player'|'settings'
tracks           DEMO_TRACKS | локальные треки из папки
trackIdx         0
isPlaying        false
progress         0–1  (из audio.currentTime / audio.duration)
shuffle          false
repeat           false
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
```

**refs:**
```
artRefs        {}   — ref на каждую HomeCard обложку (по индексу)
playerArtRef   null — ref на AlbumArt в PlayerView (для расчёта targetRect)
audioRef       null — HTML5 Audio объект
handleNextRef  null — актуальная ссылка на handleNext (чтобы onEnded не был stale)
```

**useEffect-ы (аудио):**
- монтирование: создаёт `new Audio()`, вешает `timeupdate` → setProgress, `ended` → handleNextRef
- `[trackIdx]`: обновляет `audio.src = 'file:///...'`, `audio.load()`, слушает `loadedmetadata` → обновляет `track.duration` в tracks
- `[isPlaying]`: `audio.play()` / `audio.pause()`
- `[volume]`: `audio.volume = volume`

**useEffect-ы (данные):**
- монтирование: `loadSettings()` → восстанавливает settings + сканирует musicFolder если сохранена + вызывает `loadCovers`
- `[settings]`: `saveSettings(settings)` при каждом изменении

**ключевые функции:**
- `handleNext()` / `handlePrev()` — с учётом shuffle/repeat, сбрасывают `audio.currentTime`
- `handleSeek(v)` — `setProgress(v)` + `audio.currentTime = v * audio.duration`
- `loadCovers(tracksArr)` — строка 1068: параллельно вызывает `getCoverArt(t.path)` для каждого трека с `path`, обновляет `tracks` state через `setTracks` по мере готовности
- `handleScanTracks(folder)` — строка 1078: `scanMusicFolder(folder)` → setTracks, сброс trackIdx/progress, вызов `loadCovers`
- `selectTrack(idx)` — запускает hero-анимацию (home→player), через 300мс heroExiting, через 420мс чистит hero
- `handleNav(id)` — переключение view, reverse-hero при player→home

**layout:**
```
Sidebar(58px) | LibraryPanel(260px, скрывается при libCollapsed) | CenterPlayer(flex:1) | VolumeSlider(28px)
```
все view (`home`, `player`, `settings`) всегда в DOM, видимость через opacity + pointerEvents.

### рендер (строка 1309)
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
```
