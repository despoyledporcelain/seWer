# карта renderer/index.html

весь ui — один файл ~858 строк. jsx компилируется babel standalone в браузере.

## структура файла

| строки   | что                                                        |
|----------|------------------------------------------------------------|
| 1–68     | `<head>`: cdn-скрипты, css (`:root` vars, анимации, titlebar, scrollbar) |
| 70–82    | `#titlebar` html: кнопки minimize/maximize/close через `window.electronAPI` |
| 85–855   | `<script type="text/babel">`: весь react                   |

## css-переменные (строка 14)

```css
--bg: #07070a   --border: rgba(255,255,255,0.055)
--text: #ededf4   --accent: #b2b2b2   --titlebar-h: 28px
```

анимации: `breathe` (масштаб+opacity), `spin` (360°)

## данные

**строки 88–97** — `TRACKS`: статичный массив 8 объектов `{id, title, artist, duration (сек), color (hex)}`  
**строки 99–102** — `fmt(s)` → строка `M:SS`

## компоненты (по порядку в файле)

### `useMagnet(strength=0.25)` — строки 104–149
hook. возвращает `{ref, xy, onMove, onLeave}`.  
применение: `ref` на элемент, `onMouseMove={onMove}`, `onMouseLeave={onLeave}`, `transform: translate(${xy.x}px,${xy.y}px)`.  
физика: SPRING=0.10, DAMPING=0.74, CLAMP=12px. rAF-петля всегда крутится.

### `WaveProgressBar` — строки 151–267
пропсы: `{progress [0–1], elapsed, total, onSeek(v), isPlaying}`  
canvas-волна H=52. beat-эффект: случайный импульс при isPlaying, затухает. drag по всей ширине → onSeek. onSeek вызывается и при drag (mousemove), и при click.

### `ThinVolumeSlider` — строки 269–382
пропсы: `{volume [0–1], onChange(v)}`  
canvas TW=28px, вертикальный. drag вверх = больше. onChange вызывается только на mouseUp (не во время drag — не триггерит ре-рендеры). анимирует толщину трека (2→4px) и ручку (3.5→6px) при нажатии.

### `AlbumArt` — строки 384–421
пропсы: `{track, isPlaying}`  
размытый blur-blob фона (track.color), svg-кольца, spinning disc (animation: spin 9s). breathe на blob при isPlaying.

### `MagBtn` — строки 423–443
пропсы: `{onClick, active, children, size=52}`  
круглая кнопка 52px с useMagnet(0.28). цвет: active → `--accent`, иначе rgba(255,255,255,0.38). scale(0.83) при нажатии.

### `PlayBtn` — строки 445–472
пропсы: `{isPlaying, onToggle}`  
большая кнопка 82px, useMagnet(0.18). svg play/pause inline.

### `NavIcon` — строки 474–493
пропсы: `{icon, label, active, onClick, size=38}`  
кнопка сайдбара 38px, useMagnet(0.22). active → bg rgba(178,178,178,0.11).

### `TrackRow` — строки 495–522
пропсы: `{track, isActive, onClick}`  
строка библиотеки: миниатюра 34px + title/artist + duration. hover-фон.

### `HomeCard` — строки 524–575
пропсы: `{track, onClick, artRef}`  
карточка сетки. useMagnet(0.18), scale(1.03) при hover. artRef — ref на div-обложку (нужен для HeroClone). overlay-play при hover.

### `HeroClone` — строки 577–621
пропсы: `{hero: {track, startRect, targetRect: {left,top,size}}}`  
ReactDOM.createPortal → document.body. стартует с позиции карточки (getBoundingClientRect), за ~520ms летит к позиции AlbumArt в PlayerView. pure CSS transition.

### `Sidebar` — строки 623–655
пропсы: `{navActive, onNav}`  
левая панель 58px. иконки: home/library/liked/search + settings внизу. все через NavIcon.

### `SettingsView` — строки 684–868
пропсы: `{settings, onSettings, visible}`  
макет: левая навигация 214px (секции: playback/appearance/system/about) + правый контент с карточками.  
внутренние компоненты: `Toggle`, `Row`, `Card`. локальный стейт `sec` — активная секция.  
карточки (`Card`): `borderRadius:13`, `background rgba(255,255,255,0.034)`, overflow:hidden. строки через `Row` с `borderBottom` кроме последней (`last`).

### `App` — строки 869–
**state:**
```
view           'home'|'player'
trackIdx       0
isPlaying      false
progress       0–1
shuffle        false
repeat         false
navActive      'home'
search         ''
volume         0.7
hero           null | {track, startRect, targetRect}
playerVisible  false
```

**ключевая логика:**
- строки 674–684: fake-таймер прогресса (+1/duration*0.25 каждые 250мс)
- строки 686–697: `handleNext()` / `handlePrev()` — с учётом shuffle/repeat
- строки 699–717: `selectTrack(idx)` — запускает hero-анимацию, через 160мс переключает view на 'player', через 80мс playerVisible=true (слайд-ин), через 560мс очищает hero
- строки 725–729: `handleNav(id)` — home→setView('home'), остальное→setView('player')

**layout player-view:**
```
Sidebar(58px) | LibraryPanel(260px) | CenterPlayer(flex:1) | VolumeSlider(28px)
```
LibraryPanel и CenterPlayer имеют opacity/transform переход через playerVisible.

### рендер (строка 854)
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
```
