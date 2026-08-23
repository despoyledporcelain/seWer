# карта renderer/index.html

весь ui — один файл ~4500 строк. jsx компилируется babel standalone в браузере.

## глобальные поведения
- **Tab отключён** (`window keydown → preventDefault`) — фокус-рамка не бегает по вкладкам/кнопкам, десктоп-поведение
- **нативный drag выключен** (`* { -webkit-user-drag: none }`) — обложки/иконки/кнопки не таскаются; `*:focus { outline: none }` — без обводок после клика

## структура файла

| строки    | что                                                        |
|-----------|------------------------------------------------------------|
| 1–95      | `<head>`: локальные vendor-скрипты (react production, babel, framer-motion, gsap), `hls.min.js`, css (`:root` vars, `#app-shell`, titlebar, scrollbar) |
| 96–125    | `#app-shell` + `#titlebar` html |
| 126–end   | `<script type="text/babel">`: весь react |

## css-переменные

```css
--bg: #07070a   --border: rgba(255,255,255,0.055)
--text: #ededf4   --accent: #b2b2b2   --accent-rgb: 178, 178, 178
--titlebar-h: 46px
```

`--accent` / `--accent-rgb` **динамически анимируются** через `useEffect` в `App` при смене `accentMode` или extracted цвета обложки: rAF-лерп по RGB (easeInOutCubic, 400мс) от текущего анимируемого значения к целевому. все места с `var(--accent)` / `var(--accent-rgb)` перетекают покадрово без ререндеров React.

**live accent store** (module-level): `LIVE_ACCENT {r,g,b}` + `onAccentChange(fn)` подписка. App обновляет `LIVE_ACCENT` и звенит подписчикам каждый кадр анимации. canvas-компоненты (`ThinVolumeSlider`) подписываются и перерисовываются в такт.

**гейт свечений**: `LIVE_GLOW {on}` (module-level) + `--glow-opacity` (CSS var, 0/1) + `body.glow-off` (класс). App ставит всё это в `useEffect [settings.accentMode]` при `accentMode==='off'` и дёргает `_accentSubs` для перерисовки canvas. глушат: `#accent-top` (`body.in-player:not(.glow-off)`), titlebar-градиент (эффект пропускает background), `AmbientGlow` (проп `off` → null), glow-слой ProgressBar (`opacity: var(--glow-opacity)`), shadowBlur слайдера громкости (`LIVE_GLOW.on`), `.like-glow` (`body.glow-off .like-glow { animation:none }` — pop остаётся).

**анимации:** `breathe`, `spin`, `fadeInUp`, `fadeOutDown`, `artEntrance` (легаси — частично заменены Motion-компонентами), `likePop`+`likeGlow` (пружинный pop + accent-glow при лайке, классы `.like-pop .like-glow`; HomeCard/SearchTrackRow — remount по key, правило `.like-pop.like-glow` играет оба сразу; `body.glow-off` глушит glow-часть; в PlayerLikeBtn заменено на Motion — см. компонент), `stEq` (мини-эквалайзер станции, класс `.st-eq`, 3 столбика `var(--accent)`), `shimmer` (скелетоны, класс `.skel`, псевдоэлемент-свип, стаггер через `--skel-delay`)

**скроллбары:** `.scroll-thin` (8px зона, 2px визуально), `.scroll-home` (отступы под хедер сетки)

шрифт: **Proxima Soft** (`renderer/fonts/ProximaSoft-Bold.ttf`)

## vendor

```
vendor/
  react.production.min.js
  react-dom.production.min.js
  babel.min.js
  framer-motion.min.js     — UMD build (11.18.2), глобал window.Motion
  gsap.min.js              — для HeroClone timeline и GSAP track slide
```

на верху babel-скрипта:
```js
const { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } = React;
const { motion, AnimatePresence, LayoutGroup } = Motion;
```

## assets

```
assets/
  icon.png / icon.svg       — иконка приложения
  play.png / pause.png      — кнопки плеера
  forward.png / rewind.png  — prev/next
  shuffle.png / repeat.png / repeat1.png — управление
  tracks.png / search.png / player.png   — sidebar nav
  playlists.png                          — nav вкладки «Плейлисты» (+ empty state PlaylistsView)
  local.png / settings.png               — sidebar bottom
  note.png                  — заглушка обложки (TrackRow, AlbumArt, HomeCard, HeroClone)
  vosproizvedenie.png / system.png / about.png — секции настроек + иконка прослушиваний в SearchTrackRow
  heart0.png / heart1.png   — лайки
```

## утилиты

- `smoothScroll(el, targetTop, duration)` — плавный скролл easeInOutQuad
- `fmt(s)` → `M:SS`
- `fmtCount(n)` → `12.4K` / `1.2M` / `null` если 0
- `splitArtists(str)` → `[{name, sep}]` — парсит мультиартистную строку
- `SoundCloudIcon({ size, fill })` — инлайн SVG логотип SC
- `scHashColor(id)` → `hsl(...)` по id трека
- `mapScTrack(t, noTitle)` → SC track object (см. ниже)
- `mapScPlaylist(p, auth)` → `{id, title, ownerName, ownerAvatarUrl, coverUrl, trackCount, isOwn (p.user_id===auth.userId), permalinkUrl, tracks}` — tracks встроены у SC не всегда полностью
- `fetchPlaylistTracks(id, auth, noTitle)` → полный список треков плейлиста (`GET /playlists/{id}/tracks`, пагинация limit=200)
- `plRecsUrl(id)` → URL рекомендаций плейлиста (station-эндпоинт `soundcloud:playlist-stations:{id}`); изолирован для лёгкой замены
- `extractAccentColor(url)` → Promise<`{r,g,b}` | null>. 3-пасса с relaxing thresholds (sat/lum/count) + mean fallback + dark-boost. кеширует по URL в `_accentCache`. crossOrigin=anonymous.
- `ACCENT_PRESETS` — `{ default, lavender, mint, rose, amber }` → `{r,g,b}`

## i18n

```
STRINGS        — объект { ru: {...}, en: {...} }, ~100 ключей
LangContext    — React.createContext('ru')
useLang()      — хук: возвращает t(key), читает LangContext
```

язык берётся из `settings.language` ('RU' | 'EN', default 'RU'), нормализуется в lowercase.
`App` вычисляет `lang` и `t` на каждом рендере, оборачивает JSX в `<LangContext.Provider value={lang}>`.
компоненты вызывают `const t = useLang()` внутри себя.
**исключение**: `SearchView` использует `const T = useLang()` — буква `t` занята переменной трека в `.map(t => ...)`.

ключи добавленные в сессиях: `back`, `subscribe`, `subscribed`, `artist_label`, `follow_err`, `unfollow_err`, `copy_link`, `link_copied`, `copy_link_err`, `start_station`, `station_for`, `station_exit`, `station_label`, `station_err`, `accent_title`, `accent_sub`, `accent_default/lavender/mint/rose/amber/cover`, `accent_cover_sub`, `nav_playlists`, `playlists_empty`, `playlists_empty_sub`, `accent_seg_off`, `accent_seg_color`, `accent_off_title`, `accent_off_sub`, `pl_new_title`, `pl_create_err`, `pl_edit`, `pl_login_hint`, `ed_saving`, `ed_saved`, `ed_save_err`, `ed_add`, `ed_add_search`, `ed_add_recs`, `ed_added`, `ed_empty`, `ed_recs_empty`, `ed_rec_loading`, `ed_track_del`, `pl_count_1/2/5`.

## ipc-мост (обновление)

`scFetch(url, token, clientId, method, body?, contentType?)` — 5-й параметр body (объект → JSON.stringify, строка → как есть), 6-й — опциональный Content-Type (дефолт `application/json`). PUT/DELETE/**POST** идут через ses.fetch-ветку с DataDome cookie; URL-суффикс `client_id&app_version&app_locale` (как у веб-клиента, из HAR). **Content-Type ставится только при наличии body** — запросы без тела (follow/unfollow: `POST`/`DELETE /me/followings/{id}`) сайт шлёт без него, а json-тип с пустым телом SC пытается парсить → 400 «Unable to parse JSON». **анти-бот DataDome**: write-запросы троттлятся (минимум 1.5с между), при ответе 403/429 — минутный backoff на все write (`{error, blocked:true}`), renderer показывает тост `sc_blocked`. ошибки write-ветки возвращаются с `body` (первые 600 симв ответа SC). нужно для `PUT /playlists/{id}` (порядок треков), `POST /playlists` (создание), подписки на артистов.

## компоненты

### `MarqueeText`
`{text, style, onClick, maxWidth?}`. ellipsis + tooltip. `useLayoutEffect` проверяет overflow. tooltip → portal-like absolute div с `fadeInUp 0.15s`. центрирование через CSS `translate: -50% 0` (не transform — конфликтовал с keyframes).

### `PlayerLikeBtn`
`{liked, onLike, style?}`. сердечко 19px в плеере (для SC треков). hover: scale 1.16. при лайке — **Motion-анимация** (replay по `key={'pop'+popKey}` remount): пружинный поп `scale [1, 1.45, 0.82, 1.12, 1]` + лёгкий поворот `rotate [0,-8,5,0,0]` (0.55с, easeOut) + расходящееся кольцо-вспышка (`ring`-слой, border accent, scale 0.55→1.8, fade). CSS-классы `like-pop/like-glow` здесь больше не участвуют (остались для HomeCard/SearchTrackRow).

### `LikeHeart`
`{liked, size, className?, style?}`. сердце-маска по `heart0/1.png`, заливка `currentColor` (лайкнутое — `var(--accent)`). используется в PlayerLikeBtn, HomeCard, SearchTrackRow — красится в живой акцент без CSS-фильтров.

### `ProgressBar` (бывш. WaveProgressBar)
`{progressRef, total, onSeek, isPlaying, visible}`.
div-based pill bar. высота **10px → 14px** при hover/drag (spring overshoot). external padding 10px = hit-zone ~30px. rAF обновляет `fillRef.style.transform = scaleX(p)` + thumb `left = p*100%` + текстовые таймкоды.
- **fill gradient** на `rgba(var(--accent-rgb),...)` + `color-mix(... 86%, white)` — перетекает с глобальной акцент-анимацией; `transition: background 0.18s linear` как low-pass
- **glow layer** (отдельный div, не клиппится track-overflow) — accent box-shadow (`var(--accent-rgb)`) усиливается на hover/drag
- **thumb** — белый круг 14→16px, opacity 0 при idle, появляется при hover/drag, центрирован через `translate: -50% -50%`
- **time tooltip** — при hover/drag над курсором показывается dark pill с `fmt(time)`

### `ThinVolumeSlider`
canvas TW=28px, вертикальный. drag вверх = больше. fill рисуется из `LIVE_ACCENT` (подписка `onAccentChange` → перерисовка в такт акцент-анимации), glow, без thumb.

### `AlbumArt`
`{track}`. контейнер всегда с `#111116` фоном + `note.png` placeholder сзади (opacity 0.13).
- **double-buffer crossfade** при смене `coverUrl`: новая обложка — новый скрытый слой (`CoverLayer`) поверх старой, после `load` + `decode()` плавно проявляется (opacity 0.45s), старая остаётся под ней до конца кроссфейда (prune через 800мс после ready; ready ставится ТОЛЬКО после `decode()` — иначе prune успевал до конца fade и обложка «обрезалась» в темноту). тёмной вспышки/«пустого бокса» нет. тот же `coverUrl` — новый слой не добавляется, анимации нет.
- каждый слой — **canvas**: кавер рисуется в битмап с уже скруглёнными углами (`ctx.roundRect(16*dpr)` + `clip` + `drawImage` cover-fit с запасом 1px, размер в device pixels). CSS-клипов на нём нет вообще — композитным слоям и растеризации нечего недоклипить, белые искорки в углах невозможны физически (углы битмапа прозрачные). перерисовка при ресайзе (ResizeObserver + window resize). битмапу не страшен image-cache eviction — visibilitychange-форсерелоад не нужен.
- **retry до 2 раз** с задержкой 0.5с/1с при ошибке (cache-bust query string), после — слой удаляется, виден нижний/placeholder
- eviction-защита не нужна: canvas-битмап не пропадает из кэша (это касалось только `<img>`).

### `MagBtn`
`{onClick, active, children, size=52}`. **motion.button** с `whileTap={{scale:0.82}}`, spring (600/22/0.4).

### `PlayBtn`
`{isPlaying, onToggle}`. **motion.button** с `whileTap={{scale:0.88}}`. crossfade play↔pause через два `<img>` со scale/rotate.

### `NavIcon`
`{icon, label, active, onClick, size=38, noActiveBg=false}`. активность через `opacity` (1/0.3).

### `TrackRow`
`{track, isActive, isLoading, isError, onClick, onContextMenu}`.
высота 50px. миниатюра 34px. спиннер при `isLoading`. `isError` → «недоступен» красным.
**onContextMenu** → `e.preventDefault()` + вызов проп `onContextMenu(track, x, y)`.

### `VirtualTrackList`
`{items, activeId, loadingId, errorId, onClickItem, onContextMenuItem, scrollToActive, scrollTargetId}`.
ROW_H=50. `content-visibility:auto`. абсолютный пилл с transition. `onContextMenuItem` пробрасывается в `TrackRow`.
- **edge fade-out**: `mask-image: linear-gradient(...)` динамически из state `edges={top,bottom}`. top fade видим если `scrollTop > 4`, bottom — если есть скрытый контент снизу. transition `mask-image 0.2s ease`. если содержимое влезает целиком — mask='none'.

### `HomeCard`
`{track, onSelect, artRef, artHidden, isLiked, onLike}`. **motion.div** с entry/exit spring (380/32/0.6): `scale 0.92→1`, `opacity 0→1`, exit `scale 0.88`. **layout prop убран** — был perf-bottleneck на больших гридах.
- hover-оверлей: затемнение + прозрачная play-иконка 26px (`.home-card-play`, spring-in scale 0.6→1 по cubic-bezier(0.34,1.56,0.64,1), без подложки)
- лайк-круг: `LikeHeart` 13px, при лайке pop+glow

### `HeroClone` ⚡
`{hero, exiting, reverse=false}`. portal → document.body. **GSAP timeline** `expo.inOut`, `force3D:true`.
- **одиночный div** (без inner): `overflow:hidden`, `border-radius` **анимируется** по 4 углам от `16px×4` (scale 1, плеер) до `corners/sc` (визуально ровно углы карточки-цели на приземлении — без щелчка углов). `corners [tl,tr,br,bl]` читаются хелпером `cssCorners(artEl)` при создании hero и передаются в объекте.
- animation **transform** (translate3d + scale) + borderRadius; img внутри — параллельно анимируется `clip-path: inset(0 round …)` в такт радиусу родителя
- `useLayoutEffect` + pre-paint inline `transform: translate3d(dx,dy,0) scale(sc)` → no flash при mount
- exit: `gsap.to(opacity:0)` с `power2.out` 140мс
- `contain:'layout style paint'` + `backface-visibility:hidden` — изоляция от соседнего DOM, sub-pixel AA
- `<img loading="eager" decoding="sync">` — обложка готова к старту анимации

### `TopBar` (бывш. Sidebar)
пропсы: `{navActive, onNav, libCollapsed, onToggleLib, inPlayer, scAuth, sourceMode, onToggleSource}`.
навигация встроена в тайтлбар (46px): рендерится **порталами** в статический html — левый/правый кластеры в `#topbar-slot`, центрированный сегмент абсолютом в `#titlebar`.
- **слева**: настройки → source-тумблер local/sc (только при scAuth). аватара нет — аккаунт живёт в настройках
- **центр** (абсолют `left:50%`): сегмент Плейлисты|Треки|Плеер|Поиск с горизонтальным анимируемым пиллом (`pillRect {left,width}`); id вкладок: `playlists`/`home`/`library`/`search`. **вкладка «Плеер» стоит ровно по центру окна** (слева 2 вкладки, справа 1): сегмент смещается на `navShift` (useLayoutEffect меряет центр library-кнопки относительно контейнера + resize), кнопка «Плеер» крупнее остальных (38px vs 34, иконка 19px vs 17)
- **справа**: collapse библиотеки (шеврон, только в плеере), дальше win-кнопки
- интерактив обёрнут в `-webkit-app-region:no-drag` (тайтлбар — drag-зона)

### `CrossfadeSlider`
`{value [0–12], onChange}`. drag через `setPointerCapture`. wheel (passive:false). 6px трек без thumb.

### `SettingsView`
`{settings, onSettings, visible, onScanTracks, onClearFolder, onClearCoversCache, onClearLikesCache, appAccent, scAuth, onScLogin, onScLogout, sec, setSec}`.
активная секция `sec` — **поднята в App** (`settingsSec`, дефолт `'playback'`). welcome-кнопка «войти» при `!soundcloudAuth` ставит `'account'` до навигации → настройки открываются сразу на аккаунте.
секции: `account`→SoundCloudIcon, `playback`→`vosproizvedenie.png`, `appearance`→`theme.png`, `system`→`system.png`, `about`→`about.png`.
**account**: карточка аккаунта SoundCloud. залогинен — аватар 46px + username + «log out»; нет — SC-иконка, `sc_hint` и оранжевая кнопка логина (`scLogin` IPC → `/me` → `onScLogin`). логин/логаут переехали сюда из удалённого SoundCloudView, welcome-кнопка «войти» ведёт в настройки.

**playback**: только CrossfadeSlider.

**appearance** (порядок):
1. **карточка «Акцент и свечение»**:
   - **сегмент Выкл | Цвет | От обложки** — `LayoutGroup` + `layoutId="accentSegPill"` (spring 420/34/0.7), у каждой опции мелкая svg-иконка (power / droplet / image); клик пишет `settings.accentMode` (`'off'|'color'|'cover'`)
   - под сегментом контекстный блок (key=mode, `fadeInUp 0.22s`):
     - `color` → 5 swatches (default/lavender/mint/rose/amber), круги 32px с Apple-style focus ring; клик пишет `accentPreset` + `accentMode:'color'`
     - `cover` → карточка с conic-gradient rainbow border (CSS mask `xor` trick), палитра-иконка, live preview swatch (`appAccent` real-time)
     - `off` → приглушённая карточка «свечения выключены» (power-иконка)
2. карточка «Интерфейс» — `hideDividers` toggle (влияет на разделители в SettingsView **и** SearchTrackRow)
3. карточка «Discord» — toggle `discordRpc` + анимированный блок (timestamp chips, pause chips, cover toggle)

миграция: старый `accentMode` (`'default'|'lavender'|...|'cover'`) при загрузке настроек раскладывается в новую пару `accentMode` + `accentPreset` (useEffect в App).

**system**: язык, кэш, запуск, локальная музыка.

### `SearchTrackRow`
`{track, isLiked, onLike, onClick, onCoverClick, isLoading, isError, hideDividers}`.
**motion.div** с `layout` + initial/animate/exit spring (380/34/0.6). `height:'auto'`, exit сжимается в 0.
- обложка 44px с play-оверлеем (hover) или спиннером
- title + artist (flex:1)
- stats: плей-иконка `vosproizvedenie.png` + count, длительность, `tabular-nums`
- **лайк в pill-обёртке справа** (отдельный блок): фон/бордер при active, min-width фиксирован (62px/32px) чтобы не дёргался; сердце — `LikeHeart` 11px (лайкнутое в accent), pop+glow при лайке
- `hideDividers` — `borderBottom` исчезает
- `isError` — opacity 0.55

### skeletons
`TrackRowSkeleton {i}`, `ArtistCardsSkeleton`, `SearchSkeleton`, `HomeGridSkeleton` — shimmer-заглушки (`.skel`). ширины блоков псевдослучайны по индексу (`skelW`), стаггер `--skel-delay` (`skelDelay`). где используются:
- `SearchView`: первая загрузка (до результатов) — `SearchSkeleton` под стрипой на 36%
- `ArtistView`: загрузка треков таба — 6× `TrackRowSkeleton`
- home: `scLoading && activeList пуст` — `HomeGridSkeleton` (сетка как у HomeCard, 15 блоков)

### `PlaylistsView`
`{visible, scAuth, playlists, loading, error, creating, onOpen, onEdit, onCreate, onRetry, onLogin}`. вкладка плейлистов (nav id `playlists`, view `'playlists'`): сетка `PlaylistCard` как home (`minmax(128px,1fr)`, gap 18, `HomeGridSkeleton` на загрузке), caps-заголовок + счётчик + кнопка «+» (создание POST /playlists, спиннер на время запроса). `!scAuth` → подсказка со входом (кнопка → настройки/аккаунт). пусто → `playlists_empty`, ошибка → `load_failed`+retry. грузится effect'ом при заходе во вкладку (авто-ретрая НЕТ — только кнопка «повторить», иначе петля запросов).
`loadPlaylists(auth, force?)` — эндпоинты с фолбэками (`fetchAll(url, extract, maxPages)` с пагинацией next_href, ошибки не глотает — console + `playlistsError`):
- свои: `users/{id}/playlists` → фолбэк `/me/playlists`;
- лайкнутые: `users/{id}/playlist_likes` (item.playlist или прямой айтем) → фолбэк смешанные `users/{id}/likes` (лайки треков уже работают с него), extract `it?.playlist`;
- userId из auth или `/me`; полный фейл (свои И лайкнутые упали) → `playlistsError`, `playlistsRef` НЕ заполняется чтобы retry работал; свой перекрывает лайкнутого, свои сверху; кеш в `playlistsRef`.

### `PlaylistCard`
скелет = HomeCard: полоска (владелец 10.5 / название 12) + квадратная обложка + hover-оверлей с play (оверлей `position:absolute inset:0` как у HomeCard — НЕ flex-айтемом, иначе при hover вспыхивает тёмный квадрат; hover целиком на CSS `.home-card*`, без JS-стейта); переиспользует css `.home-card*`. отличия: бейдж трек-каунта слева-снизу на обложке, вместо сердечка — ✎ (класс `.home-card-like`, только `isOwn`) → `onEdit`.

### `PlaylistEditor`
`{visible, playlist, scAuth, onClose, onUpdated, onDelete, fallbackTracks, onPlayTrack, loadingTrackId, errorTrackId}`. полноэкранный оверлей (view `'playlistEditor'`, zIndex 60, всегда смонтирован). открывается из ✎ карточки (from='playlists') или ✎ в чипе сайдбара (from='player'); назад → откуда пришёл.
- **загрузка**: на open — полный список треков (`fetchPlaylistTracks`, если встроенных меньше trackCount; встроенные p.tracks фильтруются от SC-заглушек `{id}` — приходят только первые ~4 полными)
- **Reorder-лист** (`Reorder.Group/Item` из Motion): drag всей строки (cursor grab, ≡-хендл), `whileDrag` scale+shadow+bg; ✕ удаляет. `onReorder` → `touch()`
- **панель «Добавить»**: сегмент Рекомендации|Поиск (LayoutGroup+`layoutId="plEdTabPill"`);
  - Рекомендации (`loadRecs`): `plRecsUrl(playlist.id)` (station плейлиста) → фолбэк station случайного трека из плейлиста (`soundcloud:track-stations:{id}`, ⟳ крутит выборку) → фолбэк `fallbackTracks` (последние лайкнутые из App, для пустого плейлиста);
  - Поиск: input + debounce 380ms → `/search/tracks?q=` (как SearchView, только треки);
  - строки-кандидаты — `PlaylistAddRow` (обложка 36 кликабельна: превью-прослушивание через основной плеер `onPlayTrack` → `handleScTrackClick(tr, -1)`, спиннер `loadingTrackId`/ошибка `errorTrackId` как у обложек в поиске; кнопка + / ✓-добавлено, дедуп по `inList` Set)
- **сохранение вручную** (автосейва НЕТ — беречь лимиты DataDome): `touch()` только помечает dirty (статус-пилюля `ed_dirty` «не сохранено» янтарным); в шапке появляется кнопка «Сохранить» (`ed_save_btn`, акцентная рамка) → `saveNow`. формат PUT — как у веб-клиента SC (HAR): ПОЛНЫЙ объект плейлиста с tracks = голые id; сырой объект кэшируется в `plObjRef` (GET `/playlists/{id}` один раз за сессию редактора), запасной формат — `{playlist:{tracks:[ids]}}`. после PUT одна сверка порядка через `/playlists/{id}/tracks` без ретраев. статусы: `ed_dirty` / `ed_saving` / `ed_saved` / `ed_save_err` (клик = retry)
- **выход с несохранённым**: `close()` (←) при dirty показывает модал-гард (`exitGuard`): «Сохранить и выйти» (спиннер, при ошибке остаёмся) / «Не сохранять» / «отмена». редактор — `React.forwardRef` + `useImperativeHandle({requestClose})`: мышкая кнопка «назад» и вкладки верхнего бара (handleNav перехватывает view==='playlistEditor' и зовёт requestClose, навигация блокируется до решения) проходят через тот же гард
- **удаление**: 🗑 в шапке → инлайн-подтверждение «удалить? ✓/✕» → `onDelete(playlist)` = App `handleDeletePlaylist` (`DELETE /playlists/{id}`): чистит `playlists`/`playlistsRef`, выходит из режима прослушивания если плейлист активен, закрывает редактор; ошибка → тост `pl_del_err`, редактор остаётся
- **низ**: спейсер 130px после панели добавления — список можно проскроллить ниже края
- **onUpdated(id, newTracks)**: App обновляет `playlists` и живо синхронит `playlistActive`/`playlistQueueRef` если редактируется активный плейлист
- плюрализм счётчика: `countLabel(n)` — `pl_count_1/2/5`

`fetchPlaylistTracks(id, auth, noTitle)` — `/playlists/{id}/tracks?limit=200` (голый массив ИЛИ `{collection, next_href}`, пагинация ≤10 стр.) → если пусто, фолбэк объект `/playlists/{id}` → `.tracks`. айтемы-заглушки без title/media гидратируются пачками `/tracks?ids=` (по 25), порядок — как в плейлисте; негидратируемые (удалённые с SC) выбрасываются. `handleOpenPlaylist` НЕ затирает встроенные треки пустым результатом догрузки.

### `SearchView`
`{visible, scAuth, likedIds, onLike, onPlayTrack, onSelectTrack, onResultsLoaded, onArtistClick, loadingTrackId, errorTrackId, hideDividers}`.
рефы `hasMoreRef`, `offsetRef`. `useImperativeHandle({focus, loadMore})`. карточки артистов кликабельны.
- **inputs**: иконка `position:absolute left`, input `width:100% padding`, `text-align:center`. placeholder = `t('search_ph')` = "поиск"/"search".
- **artist cards**: 42px avatar, 13.5px name, gap 14, padding 12/16, ellipsis на длинных именах. при hover тонкий бордер.
- результаты завёрнуты в `<AnimatePresence initial={false}>`.
- **первая загрузка** (loading, результатов ещё нет): `SearchSkeleton` под стрипой
- **пустой результат** (loading кончился, запрос есть, результатов 0): приглушённая иконка поиска + `t('not_found')`

### `ArtistView`
`{artist, visible, onClose, scAuth, likedIds, onLike, onPlayTrack, onSelectTrack, loadingTrackId, errorTrackId, artistCacheRef, onFollow, onCheckFollow, hideDividers}`.

**artist объект**: `{ id?, username, avatarUrl?, followersCount?, bannerUrl? }`

при открытии: если `artist.id` есть — `/users/{id}`. иначе `search/users?q=username&limit=1` → `/users/{id}`. кеш в `artistCacheRef` (Map по id или username).

**hero (asymmetric)**:
- blur-фон (banner > avatar > пусто) + тёмный градиент (apple-style)
- круглая кнопка «назад» 32px с `backdrop-filter:blur(10px)` + `rgba(0,0,0,0.42)` — видна на любом фоне
- слева аватар 148px (`borderRadius:16`), справа info-колонка:
  - caps "АРТИСТ" 10.5px
  - имя `clamp(26px, 3.4vw, 38px)` bold
  - followers + **кнопка «Подписаться»/«Вы подписаны»** в строку

**подписка**:
- эффект на `[visible, profileId]` → `onCheckFollow(profileId)` (GET /me/followings/{id})
- клик кнопки → `onFollow(profileId, isFollowing)` (POST/DELETE через scFetch)
- состояние `isFollowing`/`followBusy` локально, кеш `followedIdsRef` глобально

**табы (LayoutGroup + layoutId)**:
- 2 вкладки: Популярные / Треки
- активная имеет `<motion.div layoutId="artistTabPill">` (spring 420/34/0.7) — Motion сам анимирует пилл между табами, нет ручных измерений

**загрузка треков** (useEffect на `[tab, profileId, visible, fetchKey]`):
- Popular → `/users/{id}/toptracks?limit=20`
- Tracks → `/users/{id}/tracks?limit=20` (+ пагинация через `next_href`)

треки в `<AnimatePresence initial={false}>` через `SearchTrackRow`.

### `TrackContextMenu`
`{menu, onClose, onCopyLink, onStartStation}`. portal → document.body.
- **motion.div** с pop-in (`scale 0.92→1`, opacity, transform-origin top-left), spring (520/36/0.5). exit `scale 0.95`.
- позиция у курсора через `useLayoutEffect` (clamp за края экрана с PAD=8)
- закрывается: клик вне, Escape, scroll wheel, `blur` окна
- pill-стиль: `rgba(24,24,24,0.97)` + backdrop-blur, padding 4px, borderRadius 10
- пункты:
  - **Скопировать ссылку** (disabled если нет `permalinkUrl`)
  - **Запустить станцию** (disabled если нет id)

---

### `App` — state

```
view              — 'home'|'player'|'search'|'settings'|'artist'|'playlists'|'playlistEditor'
tracks, trackIdx, isPlaying, progress, shuffle, repeat
navActive, search, volume, hero, playerVisible, homeVisible
heroExiting, reverseHero, reverseHeroExiting
libCollapsed, settings, sort, editingTitle, editValue
scTracks, scLoading, scUpdating, scError
scPlayingTrack, scPlayingIdx
libScrollTrigger, libScrollTargetId, searchFocused
toast, toastExiting
loadingTrackId, errorTrackId
artEntranceKey
artistView      — null | { id?, username, avatarUrl?, followersCount?, bannerUrl? }
trackMenu       — null | { track, x, y }
stationActive   — null | { origTrack, tracks }
playlistActive  — null | { playlist, tracks }
playlists, playlistsLoading, playlistsError   — вкладка плейлистов (null = не грузили)
creatingPlaylist, editingPlaylist             — { playlist, from: 'playlists'|'player' }
accentRGB       — null | { r, g, b } extracted from track.coverUrl
```

`lang` и `t` — не state, вычисляются при каждом рендере из `settings.language`.

**appAccent** — `useMemo([settings.accentMode, settings.accentPreset, accentRGB])`:
- если `accentMode === 'cover'` и `accentRGB` есть → boost luminance to ≥110, returns `{r,g,b}`
- если `accentMode === 'color'` → `ACCENT_PRESETS[settings.accentPreset] || default`
- иначе (`'off'` или cover без цвета) → `ACCENT_PRESETS.default` (статичный серый)

**useEffect [appAccent]** → rAF-лерп (400мс, easeInOutCubic) `--accent` + `--accent-rgb` + `LIVE_ACCENT`/`_accentSubs` (см. css-переменные выше)

**useEffect [track.id, track.coverUrl]** → `extractAccentColor(coverUrl)` → `setAccentRGB(c)`

**settings**:
```js
{
  autoplay, crossfade: 0,
  startWithWindows, minimizeToTray,
  musicFolder, customTitles, minDuration: 30,
  soundcloudAuth, sourceMode: 'local',
  language: 'RU',
  hideDividers,
  discordRpc, discordTimestamp, discordPause, discordCover,
  accentMode: 'color', accentPreset: 'default',  // accentMode: 'off'|'color'|'cover'
}
```

### `App` — refs

```
artRefs, artRefCacheRef   — refs на обложки HomeCard
playerArtRef              — ref на AlbumArt в плеере
slideWrapRef              — обёртка обложки в плеере (GSAP slide)
playerInfoRef             — блок артист+название (GSAP анимация входа)
audioRef, hlsRef
handleNextRef, handlePrevRef, isPlayingRef
homeScrollRef
scTracksRef, scAuthRef, scCacheRef, scCacheMapRef
artistCacheRef            — Map<id|username, profile> для ArtistView кеша
followedIdsRef            — Set<userId> кеш статуса подписок
filteredRef, filteredScRef, searchRef
volumeRef, settingsRef, langRef
crossfadeRafRef, trackSwitchingRef
toastTimerRef
discordTimerRef, discordProgressRef
prevSearchRef, homeSearchRef, libSearchRef
searchQueueRef            — queue из SearchView/ArtistView (для next/prev)
stationQueueRef           — queue станции (приоритет над searchQueue в next/prev)
playlistQueueRef          — queue активного плейлиста (между станцией и поиском)
playlistsRef              — кеш списка плейлистов
scShuffleOrderRef, scShuffleIdxRef
prevViewRef               — view из которого открылся ArtistView
customTitlesRef, minDurationRef, editCancelRef
```

### `App` — helpers

- **`startFadeIn(audio)`** — fade-in для crossfade
- **`destroyHls()`** — уничтожает hls.js
- **`showToast(msg)`** — 2.2с показ, 0.24с fade-out
- **`handleSearchResultsLoaded(newTracks)`** — append к searchQueueRef + дошафливание
- **`handleOpenArtist(artist)`** / **`handleCloseArtist()`** — навигация ArtistView
- **`handleFollow(userId, currentlyFollowing)`** — POST/DELETE `/me/followings/{id}`, обновляет `followedIdsRef`
- **`checkFollow(userId)`** — GET `/me/followings/{id}`, кешируется в `followedIdsRef`
- **`handleCopyTrackLink(track)`** — GET `/share/short-link?url=...` через scFetch → `navigator.clipboard.writeText`; fallback на `track.permalinkUrl` если short-link API упал
- **`handleStartStation(track)`** — GET `/stations/soundcloud:track-stations:{id}/tracks?limit=50`, mapScTrack каждый, ставит `stationQueueRef` и `stationActive`, играет `tracks[0]`
- **`handleExitStation()`** — чистит `stationQueueRef` и `stationActive`

### `App` — mouse side-buttons

useEffect на `[view, tracks, trackIdx, handleCloseArtist]` слушает `window.mouseup`:
- **button=3** (XButton1 back): artist → handleCloseArtist; player/settings/soundcloud/search/playlists → home
- **button=4** (XButton2 forward): если есть текущий трек и `view ∉ {player, artist}` → плеер

### `App` — crossfade

- **fade-out**: в `timeupdate` — если `remaining ≤ crossfade`, `audio.volume = volume * (remaining/crossfade)`
- **fade-in SC**: `trackSwitchingRef=true`, `audio.volume=0`, `startFadeIn` в обработчике `playing` event
- **fade-in local**: `startFadeIn(audio)` перед `audio.play()`
- **пауза**: отменяет rAF; восстанавливает volume только если `!trackSwitchingRef.current`

### `App` — handleScTrackClick

1. `trackSwitchingRef=true`, `setIsPlaying(false)`, `setLoadingTrackId(id)`
2. fetch `streamUrl` → fallback `hlsUrl`
3. если оба недоступны → markError, skipInDirection если autoSkip
4. `setScPlayingTrack(resolved)`
5. `audio.volume = cf>0 ? 0 : volumeRef.current`
6. `'playing'` event → `trackSwitchingRef=false`, `startFadeIn`
7. HLS → hls.js manifest → play; иначе progressive → `audio.src` → play
8. `setLoadingTrackId(null)` в `.then()`

list priority в next/prev и handleScTrackClick: `stationQueueRef > playlistQueueRef > searchQueueRef > scTracks/filteredSc`. плейлист и станция взаимоисключающие (открытие одного чистит другое): `handleOpenPlaylist` / `handleExitPlaylist` / `handleCreatePlaylist` (POST → сразу редактор) / `handleOpenPlEditor` / `handleClosePlEditor` / `handlePlaylistUpdated` (синхрон списка + активного плейлиста).

### `App` — handleLike

`PUT /users/{userId}/track_likes/{id}` / `DELETE`. через `sc-fetch` (main process с DataDome cookie). **оптимистичный**: `apply(liked)` сразу обновляет `scTracks`/кеш (сердце заливается мгновенно, трек прыгает вверх списка лайков), при ошибке API — откат `apply(already)` + тост.

### `App` — initScLikes (кеш-миграция)

Если у `cache[0]` нет `hlsUrl` ИЛИ `permalinkUrl` как own property → старый формат → `loadScLikes(auth)` (полная перезагрузка). Защищает от устаревших полей при апдейтах.

### `App` — selectTrack (home grid → player)

async функция:
1. если `view==='player'` → просто `startPlay()`, return
2. **scroll target card в видимую область** (mirror logic из handleNav home→player) + `await rAF`
3. если `artEl` и `playerArtRef.current` есть → setHero с правильными rect'ами + переход в player
4. иначе → skip hero, обычный переход (защита от (0,0) glitch при пустых рефах)

### `App` — SC трек-объект

```js
{ id, title, artist, duration, color, coverUrl,
  artistId, artistAvatarUrl, uploaderUsername,
  likesCount, playCount,
  streamUrl, hlsUrl,
  permalinkUrl,      // для context menu copy-link и short-link API
  resolvedUrl,       // только у scPlayingTrack
}
```

### `App` — имя артиста в плеере

`splitArtists(track.artist)` разбивает строку. каждый name — отдельный кликабельный спан.
- `name === uploaderUsername` → `handleOpenArtist({id: artistId, username, avatarUrl})`
- иначе → `handleOpenArtist({username})` (ArtistView найдёт через поиск)

### `App` — Discord RPC

useEffect зависит от `[track?.id, isPlaying, settings.discordRpc, discordTimestamp, discordPause, discordCover]`. `timestamp` в main: `'progress'` → start+end; `'elapsed'` → только start; `'none'` → без.

### `App` — лейаут плеера

центральный блок:
- `width: calc(100% - 48px)`, `maxWidth: clamp(380px, 55vw, 900px)`
- порядок: playerInfoRef (артист → название) → slideWrapRef (обложка + **ambient glow blob**) → ProgressBar → controls
- **ambient glow** (за обложкой, `zIndex:0`, opacity 1 кроме hero):
  - `position:absolute inset:-30%, borderRadius:50%`
  - `background: radial-gradient` на `var(--accent-rgb)` (4 stops: 0.55 → 0.26 → 0.08 → 0) — перетекает с глобальной акцент-анимацией покадрово, crossfade-слои не нужны
  - `filter: blur(42px)`
  - `transition: opacity 0.6s ease`
- **обложка**: `width: min(100%, clamp(320px, 54vw, 760px), clamp(240px, 58vh, 760px))`
- **прогресс-бар**: `width: min(100%, clamp(260px, 34vw, 520px))`
- **библиотека**: фиксированный 260px, схлопывается через `width:0` (overflow:hidden), кнопка collapse в сайдбаре. шапка — `AnimatePresence mode="wait"`: обычный режим → поиск; `stationActive` → **контекст-чип станции** (обложка 26px / radio-иконка, caps «СТАНЦИЯ» + мини-эквалайзер `.st-eq`, название трека ellipsis, круглая кнопка ✕ справа; вход/выход fade+slide 0.2с); `playlistActive` → **чип плейлиста** (обложка/нота, caps «ПЛЕЙЛИСТ» + счётчик, название, ✎-редактор если isOwn + ✕-выход). список: `items = station ? станции : playlistActive ? треки плейлиста : activeList`

### `App` — анимации

- **Motion (framer-motion)** — на компонент-level:
  - `motion.div` с layout/initial/animate/exit/spring: HomeCard, SearchTrackRow, ProgressBar thumb (косвенно), MagBtn, PlayBtn, TrackContextMenu, toast
  - `AnimatePresence` обёртки: home grid, SearchView results, ArtistView tracks, toast, context menu
  - `LayoutGroup` + `layoutId="artistTabPill"` — sliding pill в ArtistView tabs
- **GSAP** (timeline-сложные):
  - **home→player**: HeroClone `expo.inOut` 0.38s + playerInfoRef fade+slide (`sine.out` 0.42s delay 0.08s)
  - **player→home**: reverse HeroClone `expo.inOut`
  - **смена трека**: без GSAP — обложки кроссфейдятся в `AlbumArt` (см. выше), info-блок не анимируется
- **artEntrance**: при `view→'player'` без hero → `artEntranceKey++` → scale/opacity, 420мс
- **toast**: Motion entrance/exit с spring (380/30/0.6)

### рендер
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
```
