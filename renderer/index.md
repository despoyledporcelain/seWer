# карта renderer/index.html

весь ui — один файл ~8000 строк. jsx компилируется babel standalone в браузере.

## глобальные поведения
- **Tab отключён** (`window keydown → preventDefault`) — фокус-рамка не бегает по вкладкам/кнопкам, десктоп-поведение
- **нативный drag выключен** (`* { -webkit-user-drag: none }`) — обложки/иконки/кнопки не таскаются; `*:focus { outline: none }` — без обводок после клика

### проверка правок JSX (обязательно, ловит невидимое)

**1. `/>` дважды подряд = текст на экране.** `Babel.transform` такого **не**
считает ошибкой: лишний `/>` после самозамкнутого элемента попадает в
`children` как текстовый узел и **рисуется на экране** — выглядит как
«закрывающий тег вылез». компиляция проходит чисто, глазами в 8000 строк
не видно. ловится только grep: `Select-String -Pattern '/>/>'` → пусто.
на этом уже один раз «поехала» вёрстка плеера.

**2. лишний/недостающий `</div>` = «Adjacent JSX elements must be wrapped in
an enclosing tag»**, и babel указывает на **следующий** элемент, а не на
место поломки. при правке «обернуть в div / снять обёртку» это первое, что
ломается. сверять баланс: `open - close` по ходу файла должен вернуться в 0.

**3. длинный `{/* … */}` комментарий (6+ строк) — риск.** при правке шапки
главного экрана многострочный jsx-комментарий дал
`Adjacent JSX elements must be wrapped` на элементе через 10 строк ниже, при
идеально сбалансированных тегах. воспроизводилось нестабильно: тот же текст
после соседней правки компилировался. вывод: длинные объяснения — в **эту
карту**, в файле оставлять короткий комментарий. и **не** извлекать скрипт
на проверку без явного `-Encoding UTF8`: `Get-Content -Raw` по умолчанию
читает в однобайтовой кодировке и портит кириллицу, после чего падает уже
не тот код.

### скрытые слои и hit-testing (инвариант)

оба view (`home`/`player`) и все оверлеи **всегда смонтированы**, видимость — через `opacity` + `pointerEvents`. отсюда правило, которое легко нарушить:

**`pointer-events: none` у родителя НЕ выключает клики в поддереве.** по спеке CSS потомок с `pointer-events: auto` снова становится целью, событие просто идёт к нему через родителя. а **`opacity: 0` на hit-testing вообще не влияет**.

итого: слой, который сам ставит себе `auto`, обязан учитывать `visible`/`playerVisible`/`homeVisible` сам, а не полагаться на инвариантность предка. иначе он остаётся невидимой мишенью.

жертвы этого правила (починено):
- слой списка библиотеки: `playerVisible && !lyricsOpen ? 'auto' : 'none'`
- `LyricsPanel`: `inPlayer && open ? 'auto' : 'none'`

симптом был — на главной **первый столбец сетки не нажимался**: невидимый слой шириной 260px ловил клик и отдавал его невидимой строке `VirtualTrackList` (смещение по вертикали → «включался 3-й или 4-й трек»), экран не менялся и hero не летел. по той же причине и «с поиска / без поиска» одинаково.

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

**типографическая лестница** — 7 ступеней в `:root`, все 133 инлайн-`fontSize` переведены на `var(--fs-*)`:

| токен | px | роль | что поглотил |
|---|---|---|---|
| `--fs-eyebrow` | 9.5 | caps-эйбелы с трекингом `+0.12em`, микробейджи | 9.5, 10 |
| `--fs-xs` | 11 | мета, подсказки, счётчики, статус-пилюли | 10.5, **11**, 11.5 |
| `--fs-sm` | 12 | базовый текст, пункты меню, кнопки | 12, 12.5 |
| `--fs-md` | 13 | усиленный текст, названия треков | 13, 13.5 |
| `--fs-lg` | 15 | заголовки секций, empty-state | 14.5, 15, 16 |
| `--fs-xl` | 19 | крупные заголовки | 18, 19, 20 |
| `--fs-display` | 22 | название плейлиста в редакторе | 22 |

было **16** уникальных значений: соседние 10.5/11/11.5 (54 вхождения) и 12/12.5 делали одну и ту же работу, а хвост 14.5…20 — 8 вхождений на 6 значений. правка идёт из одного места `:root`.

**жидкий ярус вне лестницы** — 4 штуки `clamp(…vw)`: имя артиста `clamp(26px, 3.4vw, 38px)`, инфо и название трека в плеере `clamp(12px, 1.5vw, 16px)` / `clamp(15px, 2vw, 24px)` / `clamp(18px, 2.6vw, 28px)`. масштабируются с шириной окна, намеренно не на ступеньках. **новый размер текста по умолчанию берёт ступеньку; жидкий — только если реально нужен адаптив.**

`fontWeight` уже был плотным: всего 500 / 600 / 700. `letterSpacing` — наоборот, 18 значений (`-0.028em`…`+0.13em`); системно правится только плюсовой трекинг caps-эйбелов, минусовые оставлены как оптическая подгонка под конкретный заголовок.

`--accent` / `--accent-rgb` **динамически анимируются** через `useEffect` в `App` при смене `accentMode` или extracted цвета обложки: rAF-лерп по RGB (easeInOutCubic, 400мс) от текущего анимируемого значения к целевому. все места с `var(--accent)` / `var(--accent-rgb)` перетекают покадрово без ререндеров React.

**live accent store** (module-level): `LIVE_ACCENT {r,g,b}` + `onAccentChange(fn)` подписка. App обновляет `LIVE_ACCENT` и звенит подписчикам каждый кадр анимации. canvas-компоненты (`ThinVolumeSlider`) подписываются и перерисовываются в такт.

**гейт свечений**: `LIVE_GLOW {on}` (module-level) + `--glow-opacity` (CSS var, 0/1) + `body.glow-off` (класс). App ставит всё это в `useEffect [settings.accentMode]` при `accentMode==='off'` и дёргает `_accentSubs` для перерисовки canvas. глушат: `#accent-top` (`body.in-player:not(.glow-off)`), titlebar-градиент (эффект пропускает background), `AmbientGlow` (проп `off` → null), glow-слой ProgressBar (`opacity: var(--glow-opacity)`), shadowBlur слайдера громкости (`LIVE_GLOW.on`), `.like-glow` (`body.glow-off .like-glow { animation:none }` — pop остаётся).

**анимации:** `breathe`, `spin`, `fadeInUp`, `fadeOutDown`, `artEntrance` (легаси — частично заменены Motion-компонентами), `likePop`+`likeGlow` (пружинный pop + accent-glow при лайке, классы `.like-pop .like-glow`; HomeCard/SearchTrackRow — remount по key, правило `.like-pop.like-glow` играет оба сразу; `body.glow-off` глушит glow-часть; в PlayerLikeBtn заменено на Motion — см. компонент), `stEq` (мини-эквалайзер станции, класс `.st-eq`, 3 столбика `var(--accent)`), `shimmer` (скелетоны, класс `.skel`, псевдоэлемент-свип, стаггер через `--skel-delay`)

**скроллбары:** `.scroll-thin` (8px зона, 2px визуально), `.scroll-home` (отступы под хедер сетки), `.scroll-none` (полосы нет вовсе, скролл живёт — панель текста песни)

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
  edit.png                  — карандаш «редактировать плейлист» на обложке карточки (PlaylistCard). чёрный на прозрачном 100x100 → рисуется 14px с `brightness(0) invert(1)`, как note.png
  back.png                  — стрелка «назад» в ArtistView. тот же приём; ховер-яркость через `opacity` на `<img>`, т.к. `currentColor` у картинки нет (у SVG был `stroke="currentColor"`)
  vosproizvedenie.png / system.png / about.png — секции настроек + иконка прослушиваний в SearchTrackRow
  heart0.png / heart1.png   — лайки
  textt.png                 — кавычки/строки текста. кнопка текста песни в плеере, иконка секции в настройках, шапка и empty-state панели. тот же приём: чёрный на прозрачном → `brightness(0) invert(1)`
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
- `LYRICS_SOURCES` — реестр источников текста песни: `[{ id, label, synced }]`, порядок в массиве = дефолтный приоритет. `synced` — умеет отдавать текст с таймкодами (подсветка строки по позиции). сейчас `lrclib`(✓) / `genius`(✗). **musixmatch сюда не внесён намеренно**: поиск у него требует apikey или сессионный токен, без них он молча вернул бы 401 на каждый трек
- `LYRICS_SOURCE_IDS` — ids источников (дефолт для настройки)
- `cleanLyricsSources(arr)` — нормализация `settings.lyricsSources`: не-массив (поля ещё не было в файле настроек) → все источники; массив → фильтр мусора + дедуп, **без** дописывания недостающих (иначе выключенный источник снова «включался» бы при каждой загрузке). вызывается и в миграции настроек, и на чтении в панелях
- `cleanTrackMeta(rawTitle, rawArtist, artistReal, uploader)` → `{title, artist, comment}` — разбор мусорных метаданных SC для тегов и имени файла. `TITLE_NOISE` снимает `[4K]`, `(Official Video/Audio)`, `(prod. …)`, `official video`, `hq`; в скобках маркер может идти **не первым** словом, отсюда `(?:[^)]*?\b)?` впереди (без него `Song (Official Audio)` не чистился). `FEAT_RE` вытаскивает `feat./ft./featuring` **до** разбора по тире — иначе «feat. X» уехал бы в название через разделитель — и **выкидывает** его из имени артиста, отдавая в `comment` как `feat. …`. разделитель `DASH_RE` (` - `, ` – `, ` — `): при известном артисте (`artistReal`) не разбираем, а **вырезаем** совпавший префикс из названия (иначе в теги уехало бы `GloRilla — Glowing` целиком); при неизвестном — левая часть становится артистом, и она важнее `uploader` (аккаунт загрузчика часто канал/лейбл, а не исполнитель)
- `fileNameFor(artist, title)` — `Artist - Title` с санитизацией: `ILLEGAL_FS` (`<>:"/\|?*` + control), схлопывание пробелов, срез хвостовых точек/пробелов. **это дублирует `sanitizeFileName` в `main.js`** — намеренно: renderer показывает пользователю то самое имя, которое потом пишется на диск, иначе в диалоге было бы одно, а на диске другое (точнее — с суффиксом ` (2)` при дубле)

## текст песни — выборка

```
cleanTrackName(s)      — название без мусорного хвоста. Genius ищет по строке
                         ЦЕЛИКОМ и на любом хвосте выдаёт 0 хитов, проверено:
                         «Поиск Врачей В Переулках Осенних 🍂 + voidvoice» → 0,
                         «Поиск Врачей В Переулках Осенних» → 1. режутся
                         скобки «(feat. …)», тире-хвост «- Remastered 2011»,
                         **плюс-хвост «+ voidvoice»** (в SC это кредит) и
                         эмодзи (`\p{So}\p{Cf}\p{No}`)
parseLrcStamp(mm)      — «00:12.34» / «01:02.5» → секунды; мусор → null
parseLrc(text)         — LRC → [{t, text, section}]. на строке бывает несколько
                         тегов ([00:10][01:20] chorus) — все становятся строками.
                         меты [ar:…] выкидываются, метки секций ([Chorus]) идут
                         с t:null. порядок строк НЕ сортируем: в LRC он уже
                         правильный, а сортировка закинула бы метки в конец
parsePlainLyrics(text) — строки без времени; «[Verse 1]» → section
decodeEntities(s)      — числовые сущности в hex И dec (genius отдаёт `&#x27;`),
                         защита от выхода за диапазон. &amp; строго последним
stripExcluded(html)    — вырезает [data-exclude-from-selection] по счётчику
                         вложенности. в genius это шапка «Contributors /
                         Translations», лежит ПЕРВОЙ внутри контейнера текста
netGet(url, headers)   — обёртка над `window.electronAPI.netFetch` (см. ipc-мост)
fetchLrclib(a, t, d)   — обходит **первые 3** trackQueries: /api/get
                         (artist+track+duration), фолбэк /api/search с выбором
                         ближайшей по duration версии. ограничение важно:
                         каждый вариант стоит 2 запроса, а на висящем lrclib
                         это до 96с ожидания. поля `synced` в ответе НЕТ —
                         синхронность по наличию syncedLyrics. у результата
                         может не быть НИ syncedLyrics, НИ plainLyrics
                         (инструментал — напр. Take Five, 0 текста из 20
                         результатов), и это честный miss, а не ошибка
divInnerAt(html, at)   — содержимое div от позиции ПОСЛЕ открывающего тега,
                         конец по СЧЁТЧИКУ вложенности (см. Genius ниже)
geniusLyricChunks(html) — все [data-lyrics-container] по порядку
## разбор названия SC

На SC трек называют «Название + кредит», и формат всё время разный:

```
«carnival * prod. @lungsinfection»      звёздочка
«Королевский XVII — Charles de Gaulle» тире, и тут НАОБОРОТ: на Genius
                                      «Название» — это правая часть,
                                      а левая стала артистом
«Song + voidvoice»                     плюс
«Song (feat. X)» / «Song [Live]»       скобки
«Song - Remastered 2011»               тире-хвост
```

Добавлять условие на каждый новый случай — путь в никуда, поэтому разбор общий:

- `CREDIT_WORDS` — слова-кредиты (`prod.`, `feat.`, `ft.`, `remix`, `rmix`,
  `mix(ed)`, `edit(s)`, `bootleg`, `rework`, `vip`, `mash(ed) up`, `sped up`,
  `slowed`, `reverb`, `nightcore`, `8d`, `flip`, `original mix`).
  `stripCreditTail` режет **по ПЕРВОМУ** вхождению: «Song feat. Bob (Remix)»
  должен дать «Song», а не «Song feat. Bob». Раньше был жадный
  `[^)\]]*…[\s\S]*$`, который съедал название целиком — «Track prod. Cool»
  превращался в пустую строку
- `TITLE_SPLIT` — знаки-разделители: `- – — * + | · /` и `x ×`.
  **Пробелы с двух сторон обязательны**, иначе `AC*DC Rock` и `2*3 = Six`
  разъедутся на части
- `plausibleTitle(s)` — мягкий отсев мусорных обломков после split: нечётные
  скобки (`Track (Slowed`, `Reverb)`), часть из одного слова-кредита. Отсев
  мягкий **намеренно**: кандидаты аддитивны, полное название всегда идёт
  первым, поэтому лишний кандидат лишь добавляет бесполезный запрос и ничего
  не ломает. Опасна только пропуск настоящего названия
- `titleCandidates(raw)` — кандидаты по убыванию правдоподобия, кап
  `TITLE_CAND_CAP = 6`: полное → без хвоста-кредита → каждая часть split →
  префикс до первого разделителя. Кап обязателен: каждый кандидат — запрос
- `trackQueries(a, rawT)` — для каждого кандидата пара `[артист, название]` и
  **перевёрнутая** `[название, артист]`, потому что на Genius роли меняются.
  Вырожденные `a === t` отбрасываются (иначе запрос «Королевский XVII
  Королевский XVII» → 0 хитов). **Второй аргумент СЫРОЙ** — разбор идёт по
  нему, чистка после
- `titleVariants(a, rawT)` — строки запроса, кап `TITLE_QUERY_CAP = 7`:
  пары → голые названия → СЫРОЕ название целиком
trackScore(cand, a, t) — ЛУЧШИЙ score кандидата по всем трактовкам. при
                         развороте роли меняются, и сравнивать только с
                         исходными полями бессмысленно — 0 вопреки точному
geniusWordOverlap(a, b) — доля слов нашего названия, найденных в кандидате, %
geniusScore(c, a, t)   — похожесть кандидата. `includes()` в обе стороны, а при
                         промахе — `geniusWordOverlap` с порогом 60%. страховка
                         обязательна: у Genius к названию почти всегда приписан
                         хвост («… (SFDITAA)»), и без неё один лишний word
                         обнулял score → гейт `s > 0` закрывал дверь найденному.
                         **без совпадения по названию возвращает 0**: совпадение
                         только по артисту — это чужая песня (раньше давало 40
                         и проходило гейт)
fetchLyrics(track, order) — см. «параллельный опрос». возвращает
                         `{status:'ready'|'empty'|'error', …, tried}`
```

**вложенность в HTML обязательна, ленивый regex тут не работает.** В контейнере
текста Genius лежит шапка «Contributors / Translations» **со своей вложенной
разметкой, в том же div**. Вариант `([\s\S]*?)<\/div>` обрывался на **первом**
внутреннем `</div>`, `stripExcluded` вычищал обрезанный остаток — и вместе с
шапкой уносил куплет после неё. На проверенном треке: **11 строк вместо 41**,
оставался только последний припев (симптом «то один припев, то два»).
`divInnerAt` + `geniusLyricChunks` считают глубину и берут блок целиком;
`open.lastIndex` прыгает за матченный блок, иначе вложенный контейнер найдётся
повторно и зациклит обход.

**`tried` и статус `error` — не украшение.** Раньше на источник стоял голый
`catch {}`, и «текст не нашёлся» (источник жив, трека нет) выглядело в панели
так же, как «IPC/сеть отвалились». Это разные вещи, и по пустому `catch` их
нельзя было разделить — ни в панели, ни в отладке. Теперь `LYRICS_MISS` = «не
нашлось», `error` = «не ответил», панель показывает причину, а в консоль падает
`console.warn('[lyrics]', id, why)`.

## текст песни — параллельный опрос

**порядок из настроек — это ПРИОРИТЕТ, а не «кто быстрее ответил»**. Но строго
последовательный обход означал ровно то, что описал пользователь: «если LRCLib
не работает, то Genius не ищет». Первый источник молчал все 12с своего таймаута
(×2 запроса `/get` + `/search` = 24с), Genius стартовал только после него, и
панель всё это время показывала «ищем текст…».

**решение — все источники в полёте одновременно + жёсткий бюджет 9с:**

```
BUDGET_MS = 9000
box[i] = null                        /* null = ещё летит */
inflight = order.map(...)             /* ВСЕ стартуют сразу */
deadline = Date.now() + BUDGET_MS     /* ДО гонки, иначе бюджет удвоится */
settle(p, ms) = Promise.race([p…, timeout(ms)])   /* ms = остаток бюджета */
await settle(inflight[0], left())
for i в order: s = box[i] || await settle(inflight[i], left())
```

- **приоритет сохранён**: ждём разрешения источника №1, даже если №2 ответил
  быстрее. побеждает порядок из настроек, а не гонка
- **ОГРАНИЧЕНО КАЖДОЕ ОЖИДАНИЕ, а не только проверка перед ним.** сначала было
  `if (Date.now() >= deadline) continue;` и только потом `await` — то есть внутри
  await можно было провисеть сколько угодно. с 4 вариантами запроса genius это
  4×12с, lrclib 4×2×12с = **до 96с молчания**, и панель всё это время висела
  на скелетоне. теперь `settle()` гоняет каждый await с остатком бюджета
- по исчерпании бюджета берётся **всё, что уже пришло**, даже от источника
  позже по приоритету (все промисы в полёте с самого начала)
- `Promise.allSettled` здесь **не годится**: он ждал бы самый медленный источник
  даже когда ответ нужного уже есть. отсюда ручной `box[]` + `race`
- промисы глушатся через `p.then(ok)/p.catch` — запись в `box` идёт сразу, а
  невидимые отказы иначе дали бы unhandled rejection
- `inflight[0]` нужно проверять на пустой `order`, иначе `.then` падает

Внутри одного источника synced приоритетнее plain.

**`LYRIC_SKEL`** — ширины строк скелетона: `[100, 96, 92, 97, 94, 88, 61]`.
Раньше звался `skelW(i, 52, 40)` и давал `52/65/38/91/44/57/70` — прыжки без
ритма, блок читался как кривой. Настоящий куплет — почти все строки полные,
последняя короче. Смещение внутри соседних строк ≤ 6%.

**Genius без токена** (официальный API его требует) разбирается в три шага, и это не перестраховка, а результат проверки живых ответов:
1. `/api/search/multi` — находит трек (секция `type:'song'`, у хитов есть `id`/`title`/`primary_artist_names`). перебирает `titleVariants` по очереди, скоринг — `trackScore` по всем трактовкам сразу
2. **страница трека** `/songs/{id}` — рабочий путь. текст лежит в `[data-lyrics-container]`, но **контейнеров несколько — по одному на секцию** ([Verse] / [Chorus] / [Bridge]), между ними пустые плейсхолдеры мобильной вёрстки. поэтому склеиваются **все непустые по порядку**: взять первый непустой = оставить только первую секцию песни. границы блоков — **по счётчику вложенности**, см. выше про `divInnerAt`
3. `/api/songs/{id}` — json. отдаёт 200, но поля `lyrics` **нет** без токена, так что это только фолбэк на будущее

Схема неофициальная и может отвалиться в любой момент — поэтому у genius два запасных пути, а у панели есть состояние `empty` с кнопкой «попробовать снова».

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

ключи добавленные в сессиях: `back`, `subscribe`, `subscribed`, `artist_label`, `follow_err`, `unfollow_err`, `copy_link`, `link_copied`, `copy_link_err`, `start_station`, `station_for`, `station_exit`, `station_label`, `station_err`, `accent_title`, `accent_sub`, `accent_default/lavender/mint/rose/amber/cover`, `accent_cover_sub`, `nav_playlists`, `playlists_empty`, `playlists_empty_sub`, `accent_seg_off`, `accent_seg_color`, `accent_off_title`, `accent_off_sub`, `pl_new_title`, `pl_create_err`, `pl_edit`, `pl_login_hint`, `ed_saving`, `ed_saved`, `ed_save_err`, `ed_add`, `ed_add_search`, `ed_add_recs`, `ed_added`, `ed_empty`, `ed_recs_empty`, `ed_rec_loading`, `ed_track_del`, `pl_count_1/2/5`, `add_to_pl`, `add_pl_new`, `added_to`, `pl_add_err`, `pl_list_err`, `ed_title_ph`, `ed_art_pick`, `ed_art_err`, `removed_from`, `pl_rm_err`, `pl_in`, `pl_out`, `pl_in_loading`, `sec_lyrics`, `lyrics_sources`, `lyrics_sources_sub`, `lyrics_off`, `lyrics_synced`, `lyrics_up`, `lyrics_down`, `lyrics_title`, `lyrics_back`, `lyrics_loading`, `lyrics_notfound`, `lyrics_notfound_sub`, `lyrics_err`, `lyrics_err_sub`, `lyrics_plain`, `lyrics_tap_line`, `lyrics_retry`, `lyrics_all_off`, `dl_save`, `dl_folder`, `dl_change`, `dl_name`, `dl_no_dir`, `dl_no_auth`, `dl_no_stream`, `dl_resolve`, `dl_not_audio`, `dl_resolving`, `dl_err`, `dl_wait`, `dl_ok`, `dl_no_tags`, `sec_discord`, `shuffle_all`, `shuffle_empty`, `search_hinted`.

### переименование трека (shift+клик по названию в плеере)

`commitEdit` раздваивается по источнику:

- **локальный** — по `path` в `settings.customTitles`, применение при скане
  папки и при загрузке настроек
- **sc** — по `id` в `settings.scTitles`, применение в **`mapScTrack`**

`SC_TITLES` — module-level `Map` (`id → title`), приём `LIVE_ACCENT`.
причина именно в модуле: `mapScTrack` — **единственная** точка, где
создаются треки soundcloud (лайки, поиск, плейлисты, станции), и она не
видит `settings`. подмена попадает в трек в момент его создания, поэтому
переживает перезагрузку кэша лайков и любой новый поиск.

⚠️ **в кэш на диск переименование НЕ пишется.** кэш хранит то, что отдал
soundcloud; иначе следующая загрузка вернула бы переименованное как
«настоящее» и отмена правки стала бы невозможной. это чисто локальная
подмена поверх ответа, на самом soundcloud ничего не меняется.

⚠️ **`id` у sc-трека — ЧИСЛО, а ключ в `settings.json` — СТРОКА. это стоило
двух неверных «починок».** `SC_TITLES` — `Map`, а `Map` сравнивает ключи **по
типу**: `has(2300654447)` против ключа `'2300654447'` — всегда `false`.
симптом обманчив: переименование живо **до перезапуска** (ключ в Map ещё
число, положен руками), а **после** — откатывается, потому что `for...in` по
json-объекту даёт строки. поэтому все обращения идут через
`scTitleKey(id) = String(id)` и `scTitleOf(id)`. сырых `SC_TITLES.get/set/has`
в коде быть не должно.

⚠️ **`mapScTrack` покрывает НЕ весь поток.** `initScLikes` при валидном кэше
кладёт треки в state **напрямую** (`cache.map(...)` → `setScTracks`), не звая
`mapScTrack` — а это самый частый путь (запуск с готовым кэшем). поэтому есть
ещё `applyScTitles(list)` — подстановка в готовые треки; зовётся в ветке кэша
и после гидратации `SC_TITLES`. **любой новый путь создания sc-треков обязан
либо звать `mapScTrack`, либо `applyScTitles`.**

проверка перед «готово»: `settings.json` содержит `scTitles` (запись живая) И
`sc_likes.json` содержит **оригинальные** названия (подмена не затесалась в
кэш). если в кэше уже переименованные — фикс сломан.

`renameScTrack(id, title)` обновляет всё, где трек уже лежит объектом, иначе
подмена видна только в следующей загрузке лайков: `scPlayingTrack` (он же
`track` в плеере и в discord rpc), сетка лайков, `playlistActive.tracks`,
`stationActive.tracks`, `searchQueueRef`, `playlistQueueRef`,
`stationQueueRef`, `scCacheMapRef`. в discord попадает само собой: у
`pushDiscord` в deps `pushDiscord`, он пересобирается на новом объекте трека.

гидратация `SC_TITLES` при старте — **синхронно, до** любого `await` в
загрузке настроек, иначе первый запуск покажет исходные названия. читать
`saved.scTitles`, а **не** `settings.scTitles`: в том замыкании `settings`
ещё старое состояние, слитое значение живёт только внутри апдейтера.

плюс **страховка от гонки**: лайки грузятся своим эффектом и могут прийти из
кэша раньше, чем прочитается `settings.json` (оба ждут ipc). тогда `Map` была
пуста, и после заполнения переподставляем `applyScTitles` в `scTracks` и
`scPlayingTrack`. кэш на диске при этом не трогаем.

`cleanScTitles(raw)` — по образцу `cleanLyricsSources`: не-объект/массив → `{}`,
пустые и не-строковые значения выкидываются (иначе `Map` получил бы
`id → undefined` и трек остался бы без названия).

**пустая строка = отмена правки**, а не «трек без названия» — `if (trimmed)`.

## ipc-мост (обновление)

`scFetch(url, token, clientId, method, body?, contentType?)` — 5-й параметр body (объект → JSON.stringify, строка → как есть), 6-й — опциональный Content-Type (дефолт `application/json`). PUT/DELETE/**POST** идут через ses.fetch-ветку с DataDome cookie; URL-суффикс `client_id&app_version&app_locale` (как у веб-клиента, из HAR). **Content-Type ставится только при наличии body** — запросы без тела (follow/unfollow: `POST`/`DELETE /me/followings/{id}`) сайт шлёт без него, а json-тип с пустым телом SC пытается парсить → 400 «Unable to parse JSON». **multipart**: body `{__multipart:{fields:[{name,value}], file:{name,filename,mime,b64}}}` — main собирает тело в Buffer с явным boundary и шлёт `multipart/form-data` (обложка плейлиста, `playlist[artwork_data]`). **анти-бот DataDome**: write-запросы троттлятся (минимум 1.5с между), при ответе 403/429 — минутный backoff на все write (`{error, blocked:true}`), renderer показывает тост `sc_blocked`. ошибки write-ветки возвращаются с `body` (первые 600 симв ответа SC). нужно для `PUT /playlists/{id}` (порядок треков), `POST /playlists` (создание), подписки на артистов.

`selectImage()` → `dialog-select-image`: нативный диалог выбора картинки (jpg/png/webp/bmp, ≤25МБ), возвращает `{dataUrl, name}` или null. обложка плейлиста: renderer кропает в квадрат ≤1600px jpeg 0.9 (`prepareArtwork`), отправка через multipart-режим scFetch.

`scDownloadTrack(t)` → `sc-download-track`: **отдельный путь, НЕ `scFetch`** — тот читает тело через `res.text()`, для бинарника в 10МБ это снесло бы память и испортило файл. принимает `{id, title, artist, comment, coverUrl, streamUrl, baseName, dir, token}` → `{path, size, tagsOk}` или `{error}`.

⚠️ **`streamUrl` приходит УЖЕ РЕЗОЛВНУТЫМ** — renderer вызывает `scFetch` и берёт `.data.url`. сам `api-v2.../stream/progressive` отдаёт **JSON-манифест**, а не звук; первая версия отдавала его в main как есть и писала на диск файл на ~1кб с расширением `.mp3`. **оба шага нужны и оба обязательны**: `streamUrl` из `mapScTrack` — это *шаг 1*, `res.data.url` — *шаг 2*; путь воспроизведения в `handleScTrackClick` делает ровно то же. `client_id` в main **не дописывается** — у CDN-ссылки он уже сидит в policy-параметрах, хвост после подписи ломает валидацию.
- **только `progressive`-transcoding** (обычный mp3). hls-only честно отдаёт `{error:'no_progressive'}` — собирать m3u8 в mp3 без ffmpeg нельзя, а писать m3u8 с расширением `.mp3` значило бы отдать пользователю битый файл
- **`looksLikeAudio` — проверка сигнатуры первых байт, до записи на диск**: mp3 начинается либо с `ID3`, либо с кадра MPEG (`0xFF` + `(b1 & 0xE0) === 0xE0`). Всё прочее отбивается с кодом: `{`/`[` → `not_audio_json`, `#` → `not_audio_m3u8`, `<` → `not_audio_html`, иначе `not_audio`; файл короче 3 байт → `too_small`. **это страховка от повторения бага выше**: endpoint отдаёт 200 с мелким телом, и без проверки это тихо уезжает на диск как валидный `.mp3`. поток рвётся на первом же чанке, `.tmp` удаляется
- пишет в `{finalPath}.tmp`, потом `rename` (атомарно: полузаписанный mp3 не остаётся на диске). при ошибке `.tmp` удаляется
- `uniquePath`: `{finalPath}.mp3` → ` (2)`, ` (3)`… молча перезаписывать нельзя
- редиректы до 5 хопов, `Authorization` **рвётся** при уходе на другой хост (CDN токен не нужен и иногда режет неожиданный заголовок). `http`/`https` выбирается по протоколу, `port` пробрасывается
- таймаут 45с — это **inactivity**, не общая длительность: `req.setTimeout` срабатывает на молчание, поэтому медленная, но живая загрузка не убивается
- `res.pipe(out)` вешается **до** счётчика прогресса: pipe берёт на себя backpressure, наш `on('data')` — только наблюдатель
- теги пишутся `node-id3` (`TIT2`/`TPE1`/`TALB`/`TRCK`/`COMM` + **`APIC` с обложкой** — картинка внутри файла, без папки). `music-metadata` в проекте только **читает** теги. обложка тянется отдельным запросом (`fetchCoverBuffer`), её сбой молча переживается
- **сбой тегов не отменяет скачивание** — mp3 уже на диске, но это не молчаливый исход: возвращается `tagsOk:false`, и renderer тостует `dl_no_tags`. иначе файл без обложки выглядел бы как «приложение забыло»

`onDownloadProgress(cb)` → `download-progress` (`{id, got, total}` / `{id, done, path}` / `{id, warn}`). **возвращает функцию отписки**: обёртка нужна, иначе `removeListener` не найдёт исходный `cb` и слушатели копятся на каждом открытии диалога. в колбэке рендерера обязателен фильтр `p.got != null` — служебные сообщения (`warn`/`done`) иначе затирали бы прогресс на `undefined` и прыгали бар на 35% в самый конец.

`discordSetEnabled(on)` → `discord-rpc-enabled` (`ipcRenderer.send`): решение на подключение вообще, по тумблеру. ответ не нужен → `send`, не `invoke`.

`onDiscordStatus(cb)` → `discord-status` (`'off'|'connecting'|'connected'|'disconnected'`). **возвращает отписку** — по тем же причинам, что и у `onDownloadProgress`.

`netFetch(url, headers)` → `net-fetch`: **отдельный канал от sc-fetch** для сторонних сервисов. в sc-fetch soundcloud-сессия с DataDome-cookie и `client_id` в URL — для источников текста это не годится (client_id превратился бы в 404, а genius не отдаёт CORS-заголовки, и из рендерера напрямую не уехать). отдаёт `{status, body}` сырым текстом: genius отвечает HTML, который разбирает рендерер.
- хосты зафиксированы в `NET_FETCH_HOSTS` (`lrclib.net`, `genius.com`) — иначе это просто открытый прокси наружу
- `User-Agent` обязателен: lrclib.net отвечает 403 на нечеловеческий
- таймаут 12с через `AbortController`, `redirect: 'follow'`
- реализация на глобальном `fetch` (Node в electron 41), не на `https.request` — ради авто-распаковки gzip/br

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
`{volume, onChange, onLiveChange}`. `volume` — это **gain 0..1** (то, что ест `audio.volume`), а внутри слайдер работает в **позициях 0..1** и на границе наружу конвертит: `volPosToGain` / `volGainToPos`, `VOL_GAMMA = 2.2` (ползунок линеен по позиции, gain = pos^2.2 — `audio.volume` линейна по амплитуде, слух нет, и без степени полезный диапазон жался в самый низ ползунка; верх по-прежнему 100%). canvas TW=28px, вертикальный. drag вверх = больше. fill рисуется из `LIVE_ACCENT` (подписка `onAccentChange` → перерисовка в такт акцент-анимации), glow, без thumb. `onLiveChange` — каждый кадр драга в audio без ререндера App, `onChange` — один раз на mouseup.

### `AlbumArt`
`{track}`. контейнер всегда с `#111116` фоном + `note.png` placeholder сзади (opacity 0.13).
- **double-buffer crossfade** при смене `coverUrl`: новая обложка — новый скрытый слой (`CoverLayer`) поверх старой, после `load` + `decode()` плавно проявляется (opacity 0.45s), старая остаётся под ней до конца кроссфейда (prune через 800мс после ready; ready ставится ТОЛЬКО после `decode()` — иначе prune успевал до конца fade и обложка «обрезалась» в темноту). тёмной вспышки/«пустого бокса» нет. тот же `coverUrl` — новый слой не добавляется, анимации нет.
- каждый слой — **canvas**: кавер рисуется в битмап с уже скруглёнными углами (`ctx.roundRect(16*dpr)` + `clip` + `drawImage` cover-fit с запасом 1px, размер в device pixels). CSS-клипов на нём нет вообще — композитным слоям и растеризации нечего недоклипить, белые искорки в углах невозможны физически (углы битмапа прозрачные). перерисовка при ресайзе (ResizeObserver + window resize). битмапу не страшен image-cache eviction — visibilitychange-форсерелоад не нужен.
- **retry до 2 раз** с задержкой 0.5с/1с при ошибке (cache-bust query string), после — слой удаляется, виден нижний/placeholder
- eviction-защита не нужна: canvas-битмап не пропадает из кэша (это касалось только `<img>`).

### `ShuffleBtn`
`{ on, onClick, variant='icon'|'pill', label, disabled, h=26, field=false, style }`.
иконка `assets/shuffle.png` — та же, что в кнопках плеера; картинке нельзя
покрасить `currentColor`, поэтому `brightness(0) invert(1)` + `opacity`
(приём `note.png`). активное состояние — живой акцент: фон
`rgba(var(--accent-rgb),.16)`, бордер `.34`, подпись `var(--accent)`.

- **pill** — 38px с подписью, главный экран
- **icon** — квадрат в ряд чипов. `h` задаёт и размер, и радиус
  (`round(h*0.32)`): у чипа это 26px/r8, у поля поиска 38px/r12
- **field** (только с `icon`) — фон поля ввода вместо прозрачного. кнопка встаёт
  в один ряд с поиском в плеере, и без этого читалась как мелкая заплата на
  более высокой линии. по умолчанию `false` — в чипе плейлиста кнопка «тихая»

### `App` — кнопка «случайно»

**`handleShuffleToggle(list)`** — то, что стоит на всех трёх кнопках: это
переключатель режима, а не «перемешать ещё раз». второй клик **выключает**
shuffle (порядок сбрасывает эффект `[shuffle]`, дальше next идёт в обычном
порядке), первый — включает через `handleShuffleStart`.

`handleShuffleStart(list)` — перемешать переданный список, включить первый
случайный трек, уйти в плеер **без hero-анимации** (клика по карточке не было,
искать `artRef` незачем). список приходит снаружи, потому что по нажатию не
угадать контекст:

| где                | список                                        |
|--------------------|-----------------------------------------------|
| главный экран      | `scTracks` / `tracks` — **поиск игнорируется** |
| плеер, у поиска    | `activeQueueList()`                           |
| чип плейлиста      | `playlistActive.tracks`                       |

`activeQueueList()` — тот же приоритет, что у `next`/`prev`:
`станция > плейлист > очередь поиска > лайки`, иначе локальный список.
режим (`sc`/`local`) читается из `settingsRef`, **не** из замыкания: эффект
`[shuffle]` не перезапускается на смене режима и держал бы старый.

⚠️ **`shuffleKeepRef` — обязателен.** эффект `[shuffle]` на `false→true`
пересобирает порядок от **текущего** трека (`buildScShuffle(list, cur.id)`) и
выбросил бы случайный старт. кнопка кладёт готовый порядок и поднимает флаг,
эффект его съедает и выходит. флаг ставится **только если shuffle выключен**:
при включённом `setShuffle(true)` это no-op, эффект не запустится, и висящий
флаг сломал бы следующий ручной переключатель.

**видимый порядок в списке не меняется** — перемешивается только порядок
воспроизведения (список отсортирован своим сортом, и он продолжает им
пользоваться). индикатор — сама плашка и подсветка кнопки shuffle в controls.

**шапка главного экрана** — порядок `подпись+счётчик (слева) → поиск (по
центру) → сортировка → «случайно» (справа)`. центрирование даёт обёртка
`flex:1 + justifyContent:center` вокруг поля: на самом инпуте `flex:1`
прижимал его влево. счётчик — **под** надписью (в одну строку «ЛАЙКИ 1315»
читалось как одно слово). отступ сверху `18px` (было 32 — пустовато под
тайтлбаром), у скроллбара correspondingly `margin-top:68px`.

**высота поля поиска** — `padding:'10px 34px'` → ~38px, радиус 13. кнопки
шафла подогнаны под ту же высоту: `h={38}`, радиус `round(h*0.32)`.

**вкл/выкл у `ShuffleBtn` — только заливкой и яркостью иконки, без рамки.**
рамка с `borderColor` выглядела чужеродно: в приложении ни одно поле не
обведено, состояние везде обозначают фоном. выкл — `rgba(255,255,255,0.05)`
и иконка `opacity .5`, вкл — `rgba(var(--accent-rgb), .10)` и иконка `.8`.

⚠️ **заливка активного состояния держится на `.10`, и это не опечатка.** на
`.20` живой акцент от обложки светил так, что кнопка выглядела включённой
лампой и била по глазам. акцент тут берётся из цвета обложки, то есть
может быть любым и очень ярким — поэтому активный фон намеренно еле
заметный, а различает состояние в основном яркость иконки.

**скроллбар панели текста песни** — класса `.scroll-none`: полосы нет
(`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`), скролл колесом
работает. бывший `.scroll-fade` (полоса вспыхивала на 900мс после скролла и
под курсором) удалён вместе со состоянием `scrolling`, `scrollHideRef` и
таймером: они ререндерили панель после каждого скролла ради строчки, которой
больше нет. границы прокрутки показывает `mask` — как у `VirtualTrackList`.

### горячие клавиши

**ctrl+f** (и русская «а») — фокус на поиск. маршрут по `view`:
`playlistEditor` → `plEditorRef.focusSearch()` (через `useImperativeHandle`:
переключает вкладку на «Поиск» и фокусит в rAF, потому что поля в dom ещё
нет) / `search` → `searchViewRef` / `player` → `libSearchRef` / иначе
`homeSearchRef`. ⚠️ без ветки редактора хоткей уводил фокус в **невидимый**
поиск под полноэкранным оверлеем.

в `placeholder` всех четырёх поисков — `search_hinted` («поиск  (Ctrl+F)»).
подсказка стоит только там, где хоткей реально доезжает, поэтому работает на
всех четырёх.

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

### `LyricsPanel`
`{ open, inPlayer, state, activeLine, onSeek, onRetry, onBack, sources }`. панель текста песни: перекрывает библиотеку в колонке 260px и уезжает вместе с ней. всегда смонтирована — видимостью управляет `open` (крестфейд + сдвиг), иначе на первом открытии был бы мгновенный переход вместо анимации. `state` = `{status:'loading'|'ready'|'empty', lines, synced, source}`, `activeLine` считает App (см. ниже) — здесь только отрисовка.
- ⚠️ **`inPlayer` в `pointerEvents` — не украшение, а часть инварианта** (см. «скрытые слои и hit-testing» ниже). `pointerEvents: inPlayer && open ? 'auto' : 'none'` — одного `open` мало: `pointer-events:none` у скрытого слоя плеера не гасит потомка, который сам возвращает себе `auto`
- **Escape закрывает панель** (эффект в App на `[lyricsOpen]`, приём из `TrackContextMenu`). панель занимает всю колонку и глушит список, а выход был один — кнопка «список» 12px в углу. колонка целиком «не работала» без видимой причины
- **вход**: `translateX(14px) → 0` + opacity, 0.44с `cubic-bezier(0.22,1,0.36,1)` с задержкой 0.08с. **выход**: 0.16с вправо. встречные слои (список уезжает влево, панель приезжает справа) — перекрёстно, без взаимного ожидания
- **верхняя полоса**: чипы источников + кнопка возврата к списку (иконка «список»). **большой плашки «ТЕКСТ ПЕСНИ» с иконкой 26px больше нет** — по просьбе на её место переехали сами источники (раньше они стояли отдельной полосой внизу, и список рисовался дважды). стиль чипа вынесен в **`CHIP`**, и кнопка возврата переиспользует его через `...CHIP` — по просьбе выключалка того же размера, что и чипы (`height:24`, `padding:'5px 8px'`, radius 7). `pointerEvents:'none'` на закрытом слое — иначе невидимый слой перехватывал бы клики по списку
- **состояния**: `loading` → **эквалайзер** (5 полос `.st-eq` + подпись `lyrics_loading`, по центру панели); `ready` → строки; `empty` → «текст не нашёлся» + «попробовали все включённые источники» + кнопка ретрая; `error` → «не удалось загрузить текст» + перечисление причин по источникам. `state === null` не рисуется вовсе — это один кадр на фейде
- **заглушка — эквалайзер, а не скелетон строк.** скелетон изображал строки текста, которых ещё нет, и в колонке 260px читался как кривые полосы (пробовал `LYRIC_SKEL = [100, 96, 92, 97, 94, 88, 61]` под ритм куплета — константа удалена как мёртвая). эквалайзер честнее: трек-то играет, движение живое, а `.st-eq` уже есть в чипе станции — новая анимация не заведена. полосы — `<i>` внутри `.st-eq` (CSS селектит именно `.st-eq i`), `animationDelay` инлайном перекрывает `nth-child`-задержки: их 5, а в CSS прописано 3
- **подписи вида `[Куплет]` / `[Chorus]` / `[Bridge]` НЕ рисуются** — по просьбе текст идёт сплошным. в данных строки остаются: индексы `lines` не сдвигаются, от них считаются подсветка и автоскролл. пропускаются только на отрисовке — `l.section ? null : …`
- **индикаторы на чипах**: ответивший подсвечен акцентом, упавший помечен **красной точкой** (причина в `title`), ещё летящий — спиннер. по этому видно, что чинить — Genius, настройки или сеть, а не гадать
- **строка**: активная — `var(--accent)` + 600 + сдвиг `translateX(2px)`, остальные `rgba(255,255,255,0.34)`/500. переход 0.28с. клик по строке с таймкодом → `onSeek(t)`; без таймкода курсор `default` и клик игнорится
- **`!synced`** — над текстом тихая строка `lyrics_plain`. подсветки не будет, и честнее сказать об этом, чем сделать вид
- **скролл**: класс **`.scroll-fade`**, не `.scroll-thin`. полоса **прозрачна по умолчанию** и появляется только на 900мс после скролла (класс `.on`) или под курсором (`:hover`), `transition 0.25s`. в колонке 260px постоянно висящая полоса читалась как тяжёлая вертикальная черта во всю высоту
- **индикация вместо постоянной полосы — градиенты по краям**, как у `VirtualTrackList`: `mask-image: linear-gradient(...)` с `EDGE_FADE = 20px`, градиент рисуется там, где контент обрезан; если контент влез целиком — `mask:'none'`. края считаются в `edgesRef` + `forceEdges()` через счётчик `edgesTick`: значения меняются на каждом скролле, а ререндер ради двух булевых не нужен, маска применяется стилем
- края пересчитываются не только на скролле: `ResizeObserver` на контейнере (смена трека, открытие панели, ресайз окна) + сброс `scrollTop = 0` при `status === 'loading'`
- **автопрокрутка**: `scrollToActive(smooth)` ставит `line.offsetTop - clientHeight/2 + line.offsetHeight/2`. **при открытии — сразу (`scrollTop`, без анимации)**: плавно прокручивать через весь текст от начала зрелищно и долго. дальше подсветка ведёт плавно (`smoothScroll` 480мс). **4 секунды после ручного скролла панель не дёргается** — иначе вырывает текст из-под читателя. свой скролл от автоскролла отличается окном `autoUntilRef` (700мс после старта), а не флагом: `smoothScroll` шлёт события пачками и флаг не успевает сброситься
- `lineRefs.current` обнуляется на каждом рендере перед `.map` — иначе после смены трека остаются протухшие ноды

### `SourceArrows`
`{ i, count, onMove, upTitle, downTitle }`. пара шевтонов `↑↓` для приоритета источника. на краях списка стрелка гаснет (`0.07`) и не кликается. **на модульном уровне** — вложенный в `LyricsSettings` компонент пересоздавался бы на каждом рендере (та же причина, что у `Item`/`PlCheck` в `TrackContextMenu`)

### `LyricsSettings`
`{ settings, onSettings, Card, Toggle }`. секция настроек «Текст песен». `Card`/`Toggle` передаются из `SettingsView` (прецедент `ClearCacheCard`) — иначе пришлось бы дублировать их или определять компонент внутри `SettingsView`.
- **включённые источники** — строки по порядку приоритета, у каждой `SourceArrows` + имя + бейдж «синхронный» (`synced`) + тумблер
- **выключенные** — отдельной группой под капс-заголовком `lyrics_off`, без стрелок, приглушены; слева пустое место 18px, чтобы названия не съезжали влево относительно включённых
- запись: `settings.lyricsSources` — массив **включённых** id в порядке поиска. выключить = убрать из массива, включить = дописать в конец, стрелки = swap соседей
- если включённых нет — под подзаголовком висит `lyrics_all_off`
- `Toggle` расширен: принимает либо `k` (ключ булевой настройки), либо явные `value`/`onChange` — тумблер поверх не-булевой настройки (членства в массиве)

### `CrossfadeSlider`
`{value [0–12], onChange}`. drag через `setPointerCapture`. wheel (passive:false). 6px трек без thumb.

### `SettingsView`
`{settings, onSettings, visible, onScanTracks, onClearFolder, onClearCoversCache, onClearLikesCache, appAccent, scAuth, onScLogin, onScLogout, sec, setSec}`.
активная секция `sec` — **поднята в App** (`settingsSec`, дефолт `'playback'`). welcome-кнопка «войти» при `!soundcloudAuth` ставит `'account'` до навигации → настройки открываются сразу на аккаунте.
секции: `account`→SoundCloudIcon, `playback`→`vosproizvedenie.png`, `lyrics`→`textt.png`, `appearance`→`theme.png`, `system`→`system.png`, `about`→`about.png`.
**account**: карточка аккаунта SoundCloud. залогинен — аватар 46px + username + «log out»; нет — SC-иконка, `sc_hint` и оранжевая кнопка логина (`scLogin` IPC → `/me` → `onScLogin`). логин/логаут переехали сюда из удалённого SoundCloudView, welcome-кнопка «войти» ведёт в настройки.

**playback**: только CrossfadeSlider.

**appearance** (порядок):
1. **карточка «Акцент и свечение»**:
   - **сегмент Выкл | Цвет | От обложки** — `LayoutGroup` + `layoutId="accentSegPill"` (spring 420/34/0.7), у каждой опции мелкая svg-иконка (power / droplet / image); клик пишет `settings.accentMode` (`'off'|'color'|'cover'`). **клик по УЖЕ активной опции — полный no-op** (`if (active) return`), анимация только при реальной смене вкладки; раньше `onSettings` звал с новым объектом и впустую перезапускал палитру `--accent` и запись настроек. **тот же гард на 5 образцах цвета** — повторный клик по выбранному не перезапускает палитру
   - под сегментом контекстный блок (key=mode, `fadeInUp 0.22s`):
     - `color` → 5 swatches (default/lavender/mint/rose/amber), круги 32px с Apple-style focus ring; клик пишет `accentPreset` + `accentMode:'color'`
     - `cover` → карточка с conic-gradient rainbow border (CSS mask `xor` trick), палитра-иконка, live preview swatch (`appAccent` real-time)
     - `off` → приглушённая карточка «свечения выключены» (power-иконка)
2. карточка «Интерфейс» — `hideDividers` toggle (влияет на разделители в SettingsView **и** SearchTrackRow)
3. ~~карточка «Discord»~~ — **вынесена в отдельную секцию `discord`**, стоит между «Текст песен» и «Оформление». это интеграция, а не вид, и в «Оформлении» она была третьим пунктом из двух. иконка секции — `DiscordIcon` (инлайн-svg, `currentColor`, тем же приёмом что `SoundCloudIcon`)

**секции настроек** (порядок в `SECS`): `account` → `playback` → `lyrics` → `discord` → `appearance` → `system` → `about`

**discord**: тумблер `discordRpc` + анимированный блок: **строка статуса подключения** (точка + текст из `discordStatus`), timestamp chips, pause chips, cover toggle. чипы с гардом `if (active) return`

миграция: старый `accentMode` (`'default'|'lavender'|...|'cover'`) при загрузке настроек раскладывается в новую пару `accentMode` + `accentPreset` (useEffect в App). там же `lyricsSources` прогоняется через `cleanLyricsSources`.

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
- **загрузка**: на open — полный список треков (`fetchPlaylistTracks`, если встроенных меньше trackCount; встроенные p.tracks фильтруются от SC-заглушек `{id}` — приходят только первые ~4 полными). **пока `loaded===false` — скелет `PlEditorRowSkeleton`** (геометрия 1:1 с реальной строкой: обложка 36, gap 12, padding 6+6 → 48px), число строк = `min(max(trackCount,3),10)` по `trackCount`, чтобы место было зарезервировано с первого кадра. раньше там был ноль высоты, и когда список приезжал, панель добавления под ним прыгала вниз на всю высоту; скачок был резким потому что рекомендации (станция) приходят заметно быстрее треков
- **панель добавления ограничена по высоте**: оба таба в `maxHeight` (рекомендации 280, поиск 320) + `overflowY:auto` + `.scroll-thin` — иначе приезд станции снова раздвигает страницу
- **Reorder-лист** (`Reorder.Group/Item` из Motion): drag всей строки (cursor grab, ≡-хендл), `whileDrag` scale+shadow+bg; ✕ удаляет. `onReorder` → `touch()`
- **панель «Добавить»**: сегмент Рекомендации|Поиск (LayoutGroup+`layoutId="plEdTabPill"`);
  - Рекомендации (`loadRecs`): `plRecsUrl(playlist.id)` (station плейлиста) → фолбэк station случайного трека из плейлиста (`soundcloud:track-stations:{id}`, ⟳ крутит выборку) → фолбэк `fallbackTracks` (последние лайкнутые из App, для пустого плейлиста);
  - Поиск: input + debounce 380ms → `/search/tracks?q=` (как SearchView, только треки);
  - строки-кандидаты — `PlaylistAddRow` (обложка 36 кликабельна: превью-прослушивание через основной плеер `onPlayTrack` → `handleScTrackClick(tr, -1)`, спиннер `loadingTrackId`/ошибка `errorTrackId` как у обложек в поиске; кнопка + / ✓-добавлено, дедуп по `inList` Set)
- **ритм отступов (одна база, кратности)**: 8 / 12 / 16 / 24 / 32. было 26 / 18 / 14 / 12 / 6 — всё круглое и близкое, глаз не считывал структуру. разброс по секциям теперь 16 (шапка→контент), 24 (шапка→список), 32 (список→панель, список→удаление)
- **шапка — ОДНА строка** `[выход] [обложка 96] [название / N треков] [сохранить]`, `marginBottom:24`. раньше это были две строки, а до того — три зоны в шапке и ~200px до контента:
  - **выход** — ассет `back.png` (тот же, что в `ArtistView`); круглый оверлей с blur оттуда **намеренно не перенесён** — он сделан для поверхности-героя, на фоне страницы только шунит. здесь тихая иконка без подложки: сама картинка `opacity .55→.95`, фон кнопки `rgba(255,255,255,.06)` только под курсором
  - **обложка 112px** (вверх от 80; высотой строка всё равно меряется по обложке, так что размер не съедает контент — клик → `selectImage` → `prepareArtwork` — центр-кроп в квадрат ≤1600px jpeg 0.9 → локальное превью + dirty; hover: камера + caps «выбрать обложку», css `.pl-art-hover`)
  - **название** `flex:1` + инлайн-правка (`--fs-display`, карандаш на hover, css `.pl-title-edit/.pl-title-pencil`, Enter/blur коммит, Esc отмена), под ним **счётчик треков обычным регистром** через `countLabel` (1 трек / 2 трека / 5 треков) — НЕ капсом, `· …` пока грузится
- **🗑 убран из шапки** — был в 30px от «Сохранить», два несовместимых намерения рядом + постоянный розовый hover. переехал **вниз под список**, тихой текстовой кнопкой над hairline-разделителем: до него надо дочитать, и он не спорит с сохранением. инлайн-подтверждение ✓/✕ переехало с ним
- **кнопка сохранения** — **заливка акцентом** `rgba(var(--accent-rgb),0.9)` + тёмный текст `#0a0a0c`, h28, radius 8, вход `scale .94→1` 0.15с (рамка `1px solid var(--accent)` + серая заливка на ховере давали грязь, а при `accentMode='cover'` рамка кричала). **плашка статуса при `dirty` скрыта** — состояние уже читается по кнопке
- **панель добавления — ОТДЕЛЬНЫЙ ВИЗУАЛЬНЫЙ СЛОЙ**: `marginTop:32`, radius 16, `background rgba(255,255,255,0.04)` + border `0.08` + своя тень `0 8px 24px rgba(0,0,0,0.24)`, padding 16. раньше был `marginTop:26` с той же полупрозрачностью и хайрлайном, что у строк списка → читался как продолжение списка, и два фокуса конкурировали. это главная правка из шести
- **empty-state в рамке**: `padding 32/24`, `border 1px dashed rgba(255,255,255,0.08)`, фон `0.015`, иконка note.png 22px + текст. раньше просто серый текст по центру на всю ширину контента — правило «либо рамка, либо иконка, либо ничего»
- **активная строка** (свойство `playingTrackId` из App = `scPlayingTrack?.id`): фон `rgba(var(--accent-rgb),0.07)`, обложка обведена `0 0 0 1.5px rgba(var(--accent-rgb),0.75)` и не приглушена (opacity 1 против 0.88), название акцентом и 600, drag-хендл акцентом. это редактор существующего плейлиста, а не абстрактный список: подсветка отличает «играет» от «просто есть»
- **панель добавления ограничена по высоте**: оба таба в `maxHeight` (рекомендации 280, поиск 320) + `overflowY:auto` + `.scroll-thin` — иначе приезд станции раздвигает страницу
- **низ**: спейсер 130→48 (панель добавления стала `marginTop:32`, хватает)

- **шапка, строка 2**: обложка 80px + счётчик треков (см. выше, в блоке «шапка похудела и перекомпонована в две строки»)
- **сохранение вручную** (автосейва НЕТ — беречь лимиты DataDome): `touch()` помечает dirty; «Сохранить» → `saveNow`: 1) если выбрана обложка — **JSON PUT на `/playlists/soundcloud:playlists:{id}/artwork`** с `{image_data: <base64>}` (multipart SC тут не принимает, всегда парсит json → 400; urn-id, не голый id; фолбэк POST удалён — 404); провал обложки **не прерывает** сейв, треки/название уходят в любом случае; 2) JSON PUT как у веб-клиента SC (HAR): полный объект (кэш `plObjRef`, GET раз за сессию) с tracks = голые id + новый title, запасной формат минимальный. после PUT одна сверка порядка через `/playlists/{id}/tracks` без ретраев. статусы: `ed_dirty` / `ed_saving` / `ed_saved` / `ed_save_err` + `ed_art_err` (клик = retry)
- **выход с несохранённым**: `close()` (←) при dirty показывает модал-гард (`exitGuard`): затемнение `rgba(4,4,8,.55)` + blur 12px, карточка 272px. **поверхность = та же, что у всех меню приложения** (`rgba(24,24,24,.97)` + blur 14px + border `rgba(255,255,255,.055)` + radius 11 + тень `0 16px 44px rgba(0,0,0,.6)`) — гард не должен выбиваться из стиля. **разметка максимально плоская**: caps-эйбел `ed_dirty` серым `rgba(255,255,255,.26)` (никакого янтаря/акцента) → заголовок 13.5px/500 в 2 строки → название плейлиста 11.5px `rgba(255,255,255,.25)` с ellipsis → **три ОДИНАКОВЫЕ кнопки** в колонку (`gap:6`, h32, radius 9, `border:1px solid rgba(255,255,255,.075)`, прозрачный фон, текст 12.5px/500). Заливок и цветов нет вообще; единственный цвет — красный на hover у «Не сохранять» (`rgba(255,80,60,.07)` фон + `rgba(255,130,115,.95)` текст). У основной кнопки при сохранении спиннер и opacity .55. вход spring 420/32/0.7 `scale .97 y 10`. редактор — `React.forwardRef` + `useImperativeHandle({requestClose})`: мышкой кнопка «назад» и вкладки верхнего бара (handleNav перехватывает view==='playlistEditor' и зовёт requestClose, навигация блокируется до решения) проходят через тот же гард
- **удаление**: тихая текстовая кнопка **внизу под списком** над hairline-разделителем → инлайн-подтверждение «удалить? ✓/✕» → `onDelete(playlist)` = App `handleDeletePlaylist` (`DELETE /playlists/{id}`): чистит `playlists`/`playlistsRef`, выходит из режима прослушивания если плейлист активен, закрывает редактор; ошибка → тост `pl_del_err`, редактор остаётся
- **низ**: спейсер 130px после панели добавления — список можно проскроллить ниже края
- **onUpdated(id, newTracks, meta?)**: App обновляет `playlists` и живо синхронит `playlistActive`/`playlistQueueRef` если редактируется активный плейлист; meta `{title, coverUrl}` применяется к списку/чипу/editingPlaylist. **meta НЕ спредится в `editingPlaylist` как есть** — там `coverUrl === undefined` когда обложку не меняли, спред копирует ключ и затирал `coverUrl`, обложка в редакторе падала на `note.png` до переоткрытия; собираем patch из непустых полей
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
`{menu, onClose, onCopyLink, onStartStation, canAddPl, onDownload, playlists, playlistsLoading, onEnsurePlaylists, plMembers, onEnsureMembers, onToggleInPlaylist, onCreateWithTrack}`. portal → document.body, внутри — fragment: корневая панель + соседний сабменю (см. пункт «Добавить в плейлист»).
- **`Item` и `PlCheck` — В Модульной области, не внутри `TrackContextMenu`** (рядом с `MENU_VARIANTS`/`itemVars`/`itemStyle`/`itemHover`, в `index.html:1022+`). объявленные внутри компонента они получали **новый тип на каждом рендере**, React пересоздавал их поддеревья, Motion проигрывал `hidden→show` заново → первые две кнопки дёргались при любом обновлении state. **решающий признак: дёргались только две кнопки из трёх** — третья («Добавить в плейлист») инлайном и потому не пересоздавалась. `Item` получает `onClose` пропом, `PlCheck` — вычисленными `state`/`busy` вместо замыканий
- **`variants`/`itemVars` — тоже в модульной области** (пересоздание объекта variants заставляло Motion пере-резолвить варианты на каждом рендере)
- **вход — на КОРНЕ, одним элементом**: `MENU_VARIANTS.hidden = {opacity 0, scale 0.92, y -7}` → `show = {opacity 1, scale 1, y 0, duration .18 ease [0.22,1,0.36,1], staggerChildren .03, delayChildren .06}`, `transformOrigin: 'top left'` — растёт от курсора. контейнер пунктов — обычный `<div>`, `exit` только на корне (у вложенного он заставлял AnimatePresence ждать его пружину и держать панель ~0.4с после закрытия)
- **у корня НЕТ `backdrop-filter`**: при альфе 0.97 блюр не виден (просвечивает 3%), но он создаёт backdrop-root, из-за чего Chromium пересчитывает блюр при появлении анимированного контента рядом; он же делал корень containing block для `position:fixed` потомков. Панель ~непрозрачна, размытие подложки не читается — блюр тут был только стоимостью
- флажок `pos.ready` убран: позиция меряется в useLayoutEffect до первой отрисовки, а `opacity: 0` из `initial` и так прячет неправильную позицию
- позиция у курсора через `useLayoutEffect` (clamp за края экрана с PAD=8)
- закрывается: клик вне, Escape (если открыт сабменю — сначала он), scroll wheel **вне** меню (скролл внутри пикера не закрывает), `blur` окна
- pill-стиль: `rgba(24,24,24,0.97)` + backdrop-blur, padding 4px, borderRadius 11
- пункты:
  - **Скачать** — **занимает место «Скопировать ссылку»** (решение пользователя). `canDownload = !!track.streamUrl`: у локального файла качать нечего, у hls-only трека нужен ffmpeg — тогда вместо пункта остаётся **Скопировать ссылку** (disabled если нет `permalinkUrl`), чтобы в меню не было заведомо мёртвой строки. Открывает `onDownload(track)` → `DownloadDialog`
  - **Запустить станцию** (disabled если нет id)
  - **Добавить в плейлист** (только при `canAddPl` = scAuth && SC-трек без `path`): раскрывает сабменю-пикер, где **чекбокс = трек уже в плейлисте**; клик по строке кладёт/снимает трек (повторно добавить нельзя — `handleAddToPlaylist` делает свежий GET и при `ids.includes(track.id)` отдаёт `'exists'` без PUT). Меню после переключения **не закрывается** — можно править несколько плейлистов подряд. Три состояния чекбокса: `'loading'` (состав едет, клик заблокирован) / `true` / `false`:
    - **сабменю — СОСЕД корневого `motion.div` в том же портале, не потомок.** Две причины: (1) `backdrop-filter` меню создаёт containing block для `position:fixed` — внутри координаты от вьюпорта уезжали на позицию меню (замер: `left 809` вместо `526`); (2) как потомок он наследовал бы `variants` корня и перезапускал каскад пунктов. `placeSub()` меряет меню, ставит `x = m.right+8`, при нехватке места флипает влево (`dir:-1`), `y = min(m.top, …)`, высота — через `offsetHeight` (не `getBoundingClientRect`); пересчёт на `resize`. обработчики клика/колеса считают сабменю «своим» через `inside()`
    - **у сабменю нет `backdrop-filter`** (при альфе 0.97 блюр не виден) и **нет scale** во входе: старые `x:-10 + scale 0.96` наезжали на меню на 2px на всё время входа — отсюда мигание соседних пунктов; `backdrop-filter` же заставлял Chromium пересчитывать блюр меню поверх анимированного ambient glow. вход — короткий сдвиг `x ∓6→0` (spring 560/36), exit 0.12с
    - **строка**: `[✓] [обложка 26] [название] [счётчик]`, фон строки `rgba(var(--accent-rgb),0.08)` когда трек внутри; `title` = `pl_in`/`pl_out`
    - **«новый плейлист»** — как раньше: создаёт с треком, `✓`, закрытие через 640мс
    - список пикера грузится лениво (`onEnsurePlaylists()`), **состав — `onEnsureMembers(playlists)`**: `fetchPlaylistTrackIds` (только id, без гидратации, пачками по 4). формат записи в `plMembers`: `{pending:true}` в полёте → `{ids:Set}` успех → `{ids:null}` провал. **второй аргумент `.then` обязателен** — без него отклонённый промис навсегда оставлял `membersBusyRef[plId]=true`. `inState`: `'loading'` только при `pending`, всё остальное (нет записи, провал) = `false`; раньше `null` читался как «грузятся» → строка залипала со спиннером навсегда, а клик по `loading` был заблокирован — добавление становилось невозможно. `loading` **не блокирует клик**: `handleAddToPlaylist` делает свежий GET и вернёт `'exists'` без PUT, дубль невозможен и по незнанию
    - строка «новый плейлист» → `onCreateWithTrack(track)` (POST сразу с треком)
    - свои плейлисты (`isOwn`): обложка 28px + название + счётчик; клик → `onAddToPlaylist(track, pl)` (GET свежий объект → PUT с id в конце). состояния строки: счётчик → спиннер → ✓ accent + подсветка строки, меню закрывается через 640мс
    - загрузка списка — 3 скелетона; ошибка — текст + «повторить» (`onEnsurePlaylists(true)`)
    - список пикера грузится лениво (`onEnsurePlaylists()` при открытии; кеш playlistsRef в App)

---

### `DownloadDialog`
`{track, scAuth, dir, onPickDir, onClose, onSaved}`. кастомный диалог сохранения **вместо нативного** — в приложении вся отрисовка своя, и системное окошко выбивается. нативный появляется ровно один раз, для выбора папки (`onPickDir` → `selectMusicFolder`): обойти ФС из рендерера нельзя, и выбранная папка запоминается в `settings.downloadsFolder`. **на модульном уровне** — объявленный внутри компонента он пересоздавался бы на каждом рендере (та же причина, что у `Item`/`PlCheck` и `LyricsPanel`)

поверхность — общая для всех оверлеев: `rgba(24,24,24,0.97)` + `blur(14px)` + `rgba(255,255,255,0.055)` + radius, подложка `rgba(4,4,8,0.55)` + `blur(12px)`

- макет: `[обложка 56] [название / артист / feat-строка]` → `ПАПКА` (путь + «изменить») → `ИМЯ ФАЙЛА` (редактируемое) → прогресс-бар → `[отмена] [скачать]`
- **разобранные метаданные показываются ДО сохранения** (`cleanTrackMeta`) — то, что попадёт в теги, видно сразу; `feat.` виден отдельной третьей строкой и в артист не попадает
- **`zIndex: 10000`** — выше меню трека (9998): клик по «Скачать» его закрывает, и его exit-анимация не должна прорисоваться поверх диалога
- **`dir` — проп из прошлого рендера: после `await onPickDir()` он не обновится.** поэтому выбор папки кладётся в локальную переменную `target` — иначе нативный диалог выскакивал бы дважды подряд (`dir || await onPickDir()` во втором аргументе)
- прогресс приходит отдельным IPC-каналом и фильтруется по `idRef` (в диалоге открыт ровно один трек). `content-length` у SC часто нет — тогда вместо процентов ширина 35% и текст `dl_wait`
- подпись кнопки **не меняется** на время загрузки — обратная связь уже идёт прогресс-баром, а смена текста дёргала бы ширину кнопки
- длинный путь режется **слева** (`'…' + dir.slice(-40)`): хвост пути информативнее начала. это тот же приём, что в настройках, а не `direction: rtl` — у того с обратными слешами Windows ломается порядок символов
- скачивание **по одному треку**, пакетного режима из плейлиста нет
- **фаза 1 — резолв URL** (`resolveStream`): `scFetch(track.streamUrl)` → `res.data.url`. она идёт **в рендерере**, а не в main, потому что (1) `scFetch` — единственный путь, обкатанный против DataDome и с `client_id` в URL, и дублировать его в main незачем; (2) CDN-ссылка короткоживущая (policy с TTL) — чем ближе к скачиванию получена, тем лучше. `dl_resolving` отдельным состоянием: `prog === null` при `busy` = идёт резолв, байты ещё не пошли, поэтому indeterminate-бар с пониженной прозрачностью
- **ошибки различаются** через `DL_ERR`: раньше всё, кроме `no_progressive`, сворачивалось в общий `dl_err`, и «пришёл json вместо звука» выглядело так же, как «сеть отвалилась» — два разных диагноза в одном сообщении. ключи, которых в `main.js` не бывает (`HTTP 403`, `'too many redirects'`), в карту **не внесены**: `new Error('HTTP ' + code)` даёт строку с **пробелом**, и такой ключ никогда не сматчился бы — всё лишнее уходит в общий `dl_err` через `|| 'dl_err'`

---

### `App` — скачивание
- `dlTrack` — state открытого диалога (`null` = закрыт)
- `handleOpenDownload(track)` — открыть
- `handlePickDlDir()` — `selectMusicFolder()` → `settings.downloadsFolder` (пишется общим эффектом сохранения настроек, так что переживает перезапуск)
- `handleDlSaved(res)` — закрыть + тост. **`res.tagsOk === false` → тост `dl_no_tags`, а не `dl_ok`**: файл сохранился, но без тегов и обложки, и по тихому «скачано» это выглядело бы как «приложение забыло»

---

### `App` — state

```
view              — 'home'|'player'|'search'|'settings'|'artist'|'playlists'|'playlistEditor'
tracks, trackIdx, isPlaying, progress, shuffle, repeat
navActive, search, volume, hero, playerVisible, homeVisible
heroExiting, reverseHero, reverseHeroExiting
libCollapsed, settings, sort, editingTitle, editValue
lyricsOpen         — панель текста песни перекрывает библиотеку
lyrics             — null | { status:'loading'|'ready'|'empty'|'error', lines, synced, source, tried }
lyricsActive       — индекс активной строки (-1 = нет)
lyricsNonce        — ретрай: тот же эффект выборки делается заново
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
  lyricsSources: ['lrclib','genius'],  // включённые, в порядке поиска
  volume: 0.7,   // GAIN 0..1, не позиция ползунка (см. ThinVolumeSlider)
}
```

громкость дублируется в settings специально: своё state `volume` ест `audio.volume` и кроссфейд, но **не переживало перезапуск** — при старте читаем `saved.volume` в `setVolume` + `volumeRef` (иначе звук рванёт на дефолте до применения), при mouseup `handleVolumeCommit` пишет обратно. файл переписывается раз за отпускание ползунка, не чаще.

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
discordTimerRef, discordProgressRef, rpcWanted
prevSearchRef, homeSearchRef, libSearchRef
searchQueueRef            — queue из SearchView/ArtistView (для next/prev)
stationQueueRef           — queue станции (приоритет над searchQueue в next/prev)
playlistQueueRef          — queue активного плейлиста (между станцией и поиском)
playlistsRef              — кеш списка плейлистов
scShuffleOrderRef, scShuffleIdxRef
prevViewRef               — view из которого открылся ArtistView
customTitlesRef, minDurationRef, editCancelRef
lyricsReqRef              — счётчик выборки текста (защита от гонки ответов)
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
- **`handleToggleLyrics()`** — переключает `lyricsOpen`; при открытии разворачивает свёрнутую библиотеку (`setLibCollapsed(false)`), иначе панели негде показываться. `useEffect [playerVisible]` закрывает панель при уходе из плеера — одной проверкой вместо `setLyricsOpen(false)` в каждой ветке `handleNav`
- **`handleLyricsSeek(t)`** — `t` секунды → `handleSeek(t / track.duration)`. сброс громкости/кроссфейда и Discord-таймстемп делает сам `handleSeek`

### `App` — текст песни (три эффекта)

1. **выборка** `[lyricsOpen, track.id, lyricsNonce]` — тянет **только пока панель открыта** (незачем грузить то, чего не видно). `lyricsReqRef` инкрементится на каждый запуск: сменился трек/порядок, а старый ответ пришёл последним и затёр бы новый — такие ответы отбрасываются по несовпадению счётчика. при пустом списке источников сразу `empty`, без запросов
2. **активная строка** `[lyricsOpen, lyrics, track.id]` — rAF, который пересчитывает индекс по `progressRef.current * duration`. **обязателен bailout** `setLyricsActive(prev => prev === idx ? prev : idx)`: без него App ререндерился бы 60 раз в секунду, значение меняется на строку пару раз за трек. при `!synced` индекс сбрасывается в -1 и rAF не крутится
3. **сброс скролла** при переходе в `loading` — внутри `LyricsPanel`, иначе открытие нового трека начиналось бы с середины прошлого

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

### `App` — трек в плейлисте (добавление/снятие)

`fetchPlaylistTrackIds(id, auth, expected)` → `Promise<Set<trackId>|null>` — состав **только по id**, без гидратации и `mapScTrack` (в отличие от `fetchPlaylistTracks`), с ранним выходом по `expected`; `null` = запрос не удался (не пустой плейлист!).

кеш: `plMembers` (state) + `plMembersRef` (зеркало) + `membersBusyRef` (plId пока едет). Запись идёт **только** через `rememberMember(plId, ids)`.

- **`ensurePlaylistMembers(list)`** — ленивая догрузка состава своих плейлистов при открытии пикера, **пачками по 4**; уже кешированные (`Set`) и уже упавшие (`null`) пропускаются, `membersBusyRef` гасит дубли на ре-рендерах
- **`handleAddToPlaylist`** → `'added' | 'exists' | 'error'`. `'exists'` — трек уже внутри: PUT не шлём, просто `rememberMember` и выходим (чекбокс не мигает)
- **`handleRemoveFromPlaylist`** → `'removed' | 'absent' | 'error'`. DELETE-трека из плейлиста у SC нет, поэтому тот же приём: свежий GET → `ids.filter(id => id !== track.id)` → PUT. правит `playlists`, состав, и **активный плейлист** — работа с `playlistActiveRef.current` идёт **вне** апдейтера `setPlaylistActive` (там нельзя звать другие setState): сняли текущий трек → `handleScTrackClick` соседнего; плейлист опустел → `handleExitPlaylist()`
- **`handleToggleInPlaylist(track, pl, isIn)`** — оркестратор чекбокса; на `'loading'` клик блокируется (не тыкаем вслепую)
- `playlistActiveRef` — зеркало `playlistActive` для хендлеров вне рендера

list priority в next/prev и handleScTrackClick: `stationQueueRef > playlistQueueRef > searchQueueRef > scTracks/filteredSc`. плейлист и станция взаимоисключающие (открытие одного чистит другое): `handleOpenPlaylist` / `handleExitPlaylist` / `handleCreatePlaylist` (POST → сразу редактор) / `handleOpenPlEditor` / `handleClosePlEditor` / `handlePlaylistUpdated` (синхрон списка + активного плейлиста, meta `{title, coverUrl}`). пикер контекст-меню: `handleAddToPlaylist(track, pl)` (GET свежий объект → PUT с id в конце → живое обновление кеша/активной очереди → тост), `handleCreatePlaylistWithTrack(track)` (POST приватный с одним треком), `ensurePlaylists(force)` (ленивая загрузка списка для пикера).

### `App` — handleLike

`PUT /users/{userId}/track_likes/{id}` / `DELETE`. через `sc-fetch` (main process с DataDome cookie). **оптимистичный**: `apply(liked)` сразу обновляет `scTracks`/кеш (сердце заливается мгновенно, трек прыгает вверх списка лайков), при ошибке API — откат `apply(already)` + тост.

### `App` — next/prev (локальная ветка)

`scPlayingTrack` задан → очередь по приоритету выше. **нет → локальный список**, и там два guard'а:
- **`sourceMode === 'sc'` → выход.** Раньше `handleNext` в режиме sc при неplaying SC-треке молча двигал `trackIdx` по **локальному** списку: «вперёд» перематывал невидимый локальный трек вместо следующего SC.
- **`curIdx === -1` → не «next = 0».** текущий трек мог быть отсеян поиском, `list.indexOf` давал `-1`, и код прыгал на первый элемент списка — визуально «следующий трек включился рандомно». Теперь явно берётся первый элемент отфильтрованного списка.

**клик по уже загруженной строке библиотеки** (`idx === trackIdx`): раньше `setIsPlaying(true); return` — полный no-op, если трек уже играет (`trackIdx = 0` из коробки, т.е. первая строка «текущая» ещё до первого запуска). Теперь честный перезапуск с нуля: `audio.currentTime = 0` + `startFadeIn` + `play()`. Раньше `progressRef` обнулялся без `audio.currentTime`, и шкала прыгала в ноль поверх продолжавшейся играть дорожки.

### `App` — initScLikes (кеш-миграция)

Если у `cache[0]` нет `hlsUrl` ИЛИ `permalinkUrl` как own property → старый формат → `loadScLikes(auth)` (полная перезагрузка). Защищает от устаревших полей при апдейтах.

### `App` — selectTrack (home grid → player)

async функция:
1. если `view==='player'` → просто `startPlay()`, return
2. **scroll target card в видимую область** (mirror logic из handleNav home→player) + `await rAF`
3. если `artEl` и `playerArtRef.current` есть → setHero с правильными rect'ами + переход в player
4. иначе → skip hero, обычный переход

**`startPlay` сбрасывает `searchQueueRef.current`.** Клик по карточке сетки —
такой же библиотечный контекст, как клик в списке слева. В `onClickItem`
библиотеки очередь поиска чистится, здесь забыли: после любого поиска в
`SearchView` она оставалась живой, а `next/prev/skip` идут по приоритету
`station > playlist > searchQueue > scTracks` — играл трек из старого поиска
вместо того, что в списке.

**обложка ищется `findArtEl(id)`** — общий хелпер на `selectTrack` **и оба hero
в `handleNav`** (раньше фолбэк был только в `selectTrack`, и обратный hero молча
пропускался). Сначала кеш ref'ов `artRefs.current[id]`, но **только если
`el.isConnected`**, иначе `querySelector('[data-sewer-art="id"]')` по
`homeScrollRef`. `data-sewer-art` стоит на обложке `HomeCard`.

Проверка `isConnected` обязательна: React вешает ref в `null` при
размонтировании, но после **перестановки** списка (сортировка, оптимистичный
лайк, догрузка обложек) в кеше остаётся уже отсоединённый узел, и
`getBoundingClientRect()` у него отдаёт нули → `HeroClone` стартует из `(0,0)` с
`scale(0)` (клон не виден вообще), а `#player-album-art` по
`opacity: hero ? 0 : 1` держит обложку пустой ещё 300мс. Читается как «кликнул
карточку — перехода нет».

### `App` — SC трек-объект

```js
{ id, title, artist, duration, color, coverUrl,
  artistId, artistAvatarUrl, uploaderUsername,
  artistReal,        // publisher_metadata.artist — настоящий исполнитель
  likesCount, playCount,
  streamUrl, hlsUrl, // progressive = обычный mp3 (единственный, что качается), hls = для стриминга
  permalinkUrl,      // для context menu copy-link и short-link API
  resolvedUrl,       // только у scPlayingTrack
}
```

**`artist` и `artistReal` — не дублирование.** `artist` = `publisher_metadata.artist || user.username`, то есть исполнитель, а если его нет — **аккаунт загрузчика**, а это часто канал или лейбл. `cleanTrackMeta` различает их: при известном `artistReal` префикс «Артист — » вырезается из названия, а при неизвестном левая часть разделителя становится артистом — и она полезнее `uploader`. Без разделения разбор `X - Y` уезжал бы в имя трека (например `GloRilla — Glowing` целиком в тег `TIT2`).

### `App` — имя артиста в плеере

`splitArtists(track.artist)` разбивает строку. каждый name — отдельный кликабельный спан.
- `name === uploaderUsername` → `handleOpenArtist({id: artistId, username, avatarUrl})`
- иначе → `handleOpenArtist({username})` (ArtistView найдёт через поиск)

### `App` — Discord RPC

**сборка присутствия — одна функция `pushDiscord(delay)`.** раньше их было две
(эффект + копия в `handleSeek`), и они делили ОДИН `discordTimerRef`, поэтому
взаимно отменяли дебаунс друг друга. копия в seek отличалась ещё и логикой: при
`!discordRpc` делала `return` вместо `discordClear`, и `isPlaying` брала из
`isPlayingRef`, а не из state. сейчас `handleSeek` только обновляет
`discordProgressRef` и зовёт `pushDiscord(400)`.

два вызова: эффект с дебаунсом **800мс** и seek с **400мс**.

**deps эффекта — `[pushDiscord, track?.id, track?.coverUrl, track?.duration, isPlaying, scPlayingTrack, settings.discordRpc, settings.discordTimestamp, settings.discordPause, settings.discordCover]`.** по одному
`track?.id` нельзя: `coverUrl` у локальных приезжает асинхронно
(`loadCovers`), `duration` уточняется в `loadedmetadata` — а дискорд сам
activity не перерисовывает, и неверные данные висели бы весь трек. `pushDiscord`
в списке нужен отдельно: переименование трека (`commitEdit`) создаёт новый
объект с новым `title` при неизменных id/coverUrl/duration, и без него эффект
держал бы старое замыкание.

**обложка уходит в main без гейта.** https-ссылки (SoundCloud) дискорд тянет
сам. локальные — это **data-url** (`getCoverArt`), и их раньше резал гейт
`startsWith('https://')` в main, то есть тумблер «обложка» на всей локальной
библиотеке был no-op. now: `data:image` передаётся как есть + `coverKey =
track.id`, дальше main грузит.

**`rpcWanted` — отдельный state, а не `settings.discordRpc` напрямую.**
`null` = настройки ещё не прочитаны. при `null` шлём `false`: дефолт
`discordRpc:true` в state иначе успевал увести main в connect, и пользователь с
выключенным RPC получал лишний connect/disconnect на каждом запуске. реальное
значение ставит загрузка настроек (`saved?.discordRpc !== false`).

**`discordProgressRef` обнуляется вместе с `progressRef`** при смене трека.
иначе на неигрющем треке (пауза, ошибка загрузки) `timeupdate` не придёт и в
присутствие уедет прогресс предыдущего.

**`cleanDiscordSettings(s)`** — нормализация по образцу `cleanLyricsSources`,
в той же миграции настроек. без неё мусорное значение из `settings.json`
(например `'Progress'`) уезжало в main как есть: в UI не подсвечивался ни один
чип, а в main `ts === 'progress'` давало false и режим молча проваливался в
`elapsed`.

**статус подключения** приходит из main событием `discord-status`
(`off`|`connecting`|`connected`|`disconnected`) и рисуется строкой с точкой в
карточке Discord. раньше все ошибки глотались пустым `catch`, и «всё работает»
выглядело так же, как «Discord не запущен» — см. «тихий catch» выше.

**чипы таймстампа/паузы** получили гард `if (active) return` — как сегмент
акцента. клик по уже активному чипу больше не переписывает `settings.json`.

в main (`main.js:12-241`):

```
discord-rpc-enabled (send)  — решение на подключение, а не «обновить присутствие».
                              тумблер = вкл/выкл сокет. initDiscord() из
                              whenReady убран: rpc выключен — а сокет уже открыт,
                              и включить его было нельзя без перезапуска
withTimeout(p, ms)          — ВСЕ rpc-вызовы обёрнуты. Client.request()
                              резолвится только по ответу с совпавшим nonce,
                              таймаута в библиотеке нет: зависший дискорд держал
                              before-quit (с preventDefault!) вечно, то есть
                              приложение не закрывалось ни через трей, ни крестиком
connectDiscord()            — ready/disconnected/login-fail → scheduleDiscordReconnect
                              с backoff 1.5с→30с. раньше 'disconnected' просто
                              ставил флаг, и rpc мёрт до перезапуска приложения
teardownDiscordClient()     — removeAllListeners перед destroy: destroy() сам эмитит
                              'disconnected', иначе ui мигал «соединение потеряно»
                              на КАЖДОМ переподключении
discordQueued / discordBusy — буфер последней activity + сериализация отправки.
                              переживает «присутствие ушло раньше handshake» —
                              иначе первый трек (тем более при autoplay) не
                              показывался до следующего изменения состояния
```

**`buildActivity`:**

| поле        | значение                                                          |
|-------------|-------------------------------------------------------------------|
| `type: 2`   | Listening — заголовок «Слушает `name`»                             |
| `name`      | **артист**. раньше не передавался вовсе → дискорд подставлял имя зарегистрированного приложения, отсюда «Слушает SoundCloud» |
| `details`   | название трека                                                     |
| `state`     | **нет**                                                           |
| `largeImageText` | **нет**                                                      |
| `largeImageKey` | https-ссылка как есть; data-url → загруженный `external:…`     |

⚠️ **третьей строки нет намеренно.** `state` и `largeImageText` клиент рисует
в одном и том же слоте под `details`, и артист уже стоит в заголовке — с
любым из них он дублируется («Слушает X / Название / X»). проверено на живом
клиенте: с `state` строка была, с одним `largeImageText` строка тоже была.
итог — ровно две строки, Spotify-раскладка. потерян тултип на обложке,
это цена отсутствия дубля.

таймстемпы — **только на PLAYING** (`d.isPlaying && dur > 0 && ts !== 'none'`),
и это не «оптимизация»:

⚠️ **заморозить таймер на паузе нельзя.** discord считает прошедшее как
`Date.now() - start` у себя, каждую секунду. `startTimestamp` — это якорь в
прошлом, поэтому цифра продолжает тикать мимо остановленной музыки. единственный
способ — убрать timestamps совсем. вариант «отдать только start на паузе»
был попыткой заморозить — он не замораживал, а просто врал.

| режим      | на игре                                     | на паузе     |
|------------|---------------------------------------------|--------------|
| `progress` | start + end → «прошло / всего», тикает с 0:00 | таймера нет |
| `elapsed`  | только start → «прошло», тикает с 0:00        | таймера нет |
| `none`     | ничего → остаётся одно название трека         | таймера нет |

на паузе карточка остаётся (если `discordPause:'show'`) — пропадает именно
таймер.

🚧 **`none` не работает в клиенте, и это не наша дыра.** проверено на живом
клиенте: при `ts:'none'` payload чистый, timestamps не отправляются вообще
(`sent:"none"` в логе) — а клиент всё равно рисует замершие `0:00`. он держит
**собственный** якорь от прошлой activity и не сбрасывает его, потому что
новая activity приходит уже без timestamps. `clearActivity` перед `setActivity`
не помог, поэтому режим оставлен как есть, а не «починен» наугад. чинить
иначе нечем: сброса состояния на стороне RPC-клиента нет.

в консоль пишется **только ошибки** (`console.warn` на провале логина, на
загрузке обложки, на `setActivity`). успешных пушей не логирует: на каждый
`setActivity` строка в консоли — это шум, а толку в проде ноль. полный
protocol-дамп (сырой hex каждого фрейма) — за `SEWER_RPC_DEBUG=1`, по
умолчанию молчит.

диагностика, которой здесь не хватало, делалась одноразово логом
`[discord] set` (`ts`/`playing`/`dur`/`pr`/`sent`) — с ним сразу стало видно,
что при `ts:'none'` payload чистый, а таймер рисует клиент. лог убран, вывод
вписан в раздел про таймстемпы.

**локальные обложки** (`rpcAssetKey`) — `INITIATE_IMAGE_UPLOAD` → POST →
`largeImageKey = 'external:' + upload_filename`. ⚠️ команда **недокументированная**
(в библиотеке помечена «may not even be correct»), поэтому вся функция
деградирует в `null` на любом сбое — это ровно то же, что было до её
появления, просто нет картинки. кеш `coverKey → external:…` в `rpcAssets`,
потолок `RPC_ASSET_LIMIT = 250` на сессию (дискорд держит ~300 активных
ассетов на приложение, и загруженные не исчезают). сперва пробует сырые
байты, при не-2xx — multipart c `payload_json`+`file`.

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
- **библиотека**: фиксированный 260px, схлопывается через `width:0` (overflow:hidden), кнопка collapse в сайдбаре.
  - **внутри — два абсолютных слоя** в контейнере `position:relative; width:260`: слой списка (`inset:0`, flex-колонка: чип/поиск + `VirtualTrackList`) и `LyricsPanel`. оба всегда смонтированы, видимостью управляет `lyricsOpen` (см. `LyricsPanel`). раньше здесь был просто flex-контейнер — абсолютная позиция нужна, чтобы слои накладывались, а не толкали друг друга; родитель клипует `translateX`, поэтому за колонку ничего не вылезает
  - шапка — `AnimatePresence mode="wait"`: обычный режим → поиск; `stationActive` → **контекст-чип станции** (обложка 26px / radio-иконка, caps «СТАНЦИЯ» + мини-эквалайзер `.st-eq`, название трека ellipsis, круглая кнопка ✕ справа; вход/выход fade+slide 0.2с); `playlistActive` → **чип плейлиста** (обложка/нота, caps «ПЛЕЙЛИСТ» + счётчик, название, ✎-редактор если isOwn + ✕-выход). список: `items = station ? станции : playlistActive ? треки плейлиста : activeList`
- **кнопка текста песни**: `MagBtn` с `textt.png` в ряду управления, **слева от shuffle**, тот же размер (`SIDE = clamp(40px, 5.2vw, 58px)`) и та же иконка 18–26px. при `lyricsOpen` иконка в `var(--accent)` (как у активного shuffle/repeat)
  - **баланс ряда**: слева теперь контента БОЛЬШЕ, чем справа, и play уехал. старый балансирующий спейсер `27px` слева от shuffle **убран** (он уравнивал play с лайком, когда слева было только shuffle+prev) — вместе с новой кнопкой он сдвигал play на 29px. справа вместо него **постоянный слот шириной лайка**: сам `PlayerLikeBtn` при `scPlayingTrack`, иначе невидимый `width:27 + marginLeft:14`. в обоих случаях ряд сбалансирован (210px слева против 193px справа, play в пределах 9px от центра) и **лайк никуда не уезжает** — наивный зеркальный спейсер справа отталкивал его на всю ширину кнопки

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
- **toast**: **снизу по центру** — `bottom: 26`, вход `y 8→0`, выход `y 5` (пробовали сверху под тайтлбар — вернули вниз, понравился только дизайн). Поверхность как у меню: `rgba(24,24,24,.97)` + **blur 20px** + border `rgba(255,255,255,.055)` + radius 11 + та же тень. Единственное пятно цвета — **точка акцента** 5px в `var(--accent)` с мягким свечением (следует за темой); текст 12px `rgba(255,255,255,.72)` (было 0.45 — нечитаемо). Без `scale`-пружины. `maxWidth: min(440px, calc(100vw - 48px))` + перенос вместо `nowrap`. вход/выход Motion spring (420/32/0.7), 2.2с показ + 0.24с уход

### рендер
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
```
