SoundCloud плейлисты: вкладка + вход через плеер + редактор с автосейвом

РЕШЕНИЯ (по ответам): вкладка показывает лайкнутые + свои плейлисты; карандашик только на своих (API не даёт менять чужие); кнопка «+» создаёт свой; правки сохраняются автоматически (debounce ~1с) с индикатором статуса в шапке редактора.

ЭТАП 1 — IPC: body для scFetch (main.js + preload.js)
- preload: `scFetch(url, token, clientId, method, body)` — 5-й параметр.
- main.js `sc-fetch`: write-ветка (сейчас PUT/DELETE) принимает body → `ses.fetch(..., { body: JSON.stringify(body) })` + header `Content-Type: application/json`; POST тоже пустить через ses.fetch-ветку (нужно для создания плейлистов). GET-ветку не трогаем.

ЭТАП 2 — данные (renderer/index.html)
- `mapScPlaylist(p, auth)` → `{id, title, coverUrl (artwork_url→t500x500), ownerName, trackCount, isOwn (p.user_id === auth.userId), tracks: (p.tracks||[]).map(mapScTrack)}`.
- `loadPlaylists()`: параллельно `GET /me/playlists` + `GET /me/playlist_likes` (пагинация по next_href), merge с дедупом по id (свой перекрывает лайкнутый), сортировка: свои сверху. State: `playlists`, `playlistsLoading`, `playlistsError`; кеш в ref, грузим при первом заходе во вкладку (как лайки).
- Ленивая догрузка: при открытии плейлиста если `tracks.length < trackCount` → `GET /playlists/{id}/tracks` (пагинация).

ЭТАП 3 — карточки и вкладка
- `PlaylistCard` — точный скелет HomeCard: полоска-заголовок (владелец 10.5px / название 12px), квадратная обложка, hover-оверлей + play, entry/exit spring, CSS `.home-card` переиспользуем. Вместо сердечка — ✎ (только isOwn, stopPropagation → редактор); на чужих ничего.
- `PlaylistsView`: caps-заголовок + счётчик + кнопка «+» (POST /playlists {playlist:{title:'New playlist', tracks:[]}} → в state → открыть редактор), сетка `repeat(auto-fill, minmax(128px,1fr))` gap 18, `HomeGridSkeleton` на загрузке, пустые состояния, при !scAuth — подсказка со входом в аккаунт.

ЭТАП 4 — вход в плейлист (паттерн станции)
- state `playlistActive {playlist, tracks}` + `playlistQueueRef`.
- `handleOpenPlaylist`: догрузка треков при необходимости → mapScTrack → queue = tracks, чистит станцию/поиск (взаимоисключающие), `setView('player')`, nav 'library', автоплей первого трека (как handleStartStation).
- Priority-цепочка очередей в 5 местах (handleNext/handlePrev/handleScTrackClick×2/shuffle-effect): `stationQueueRef || playlistQueueRef || searchQueueRef || scTracks`.
- `handleStartStation` чистит плейлист-режим, `handleExitPlaylist` наоборот.
- Сайдбар: существующий AnimatePresence получает третье состояние — чип плейлиста (обложка 26px, caps «ПЛЕЙЛИСТ», счётчик треков вместо эквалайзера, название, ✕ выход + маленький ✎ рядом если isOwn → редактор).
- VirtualTrackList: `items = stationActive ? station.tracks : playlistActive ? playlistActive.tracks : activeList` + ветка onClickItem.

ЭТАП 5 — редактор (PlaylistEditor)
- Полноэкранный оверлей-вид `view==='playlistEditor'` (как SettingsView/ArtistView — всегда смонтирован, visible-паттерн).
- Шапка: ← назад, название, счётчик, статус-пилюля «сохраняем… / сохранено / ошибка·повторить».
- Треки: `Reorder.Group/Reorder.Item` (framer-motion 11 уже в vendor) — вертикальный drag для перестановки, строка = handle ≡ + обложка 40px + title/artist + длительность + ✕ удалить; spring-анимации в стиле SearchTrackRow; LayoutGroup для лёгкой перестановки.
- Панель «Добавить» — сегмент «Поиск | Рекомендации» (пилл как в настройках акцента):
  - Поиск: input + debounce 380ms → `GET /search/tracks?q=` → строки с «+»; уже добавленные подсвечены.
  - Рекомендации: `GET /stations/soundcloud:playlist-stations:{id}/tracks?limit=50` — первичный кандидат; точный URL подтвердим через твои девтулзы со страницы плейлиста на SC (ты предлагал помочь), функция изолированная — URL в одном месте.
- Автосейв: debounce 1с после правки → `PUT /playlists/{id}` body `{playlist:{tracks:[{id},...]}}`; при закрытии редактора с несохранённым — форс-сейв; ошибка → статус + повтор по клику.

ЭТАП 6 — навигация и мелочи
- handleNav/мышиная кнопка «назад»: из редактора → обратно во вкладку плейлистов; i18n-ключи (ru/en) для всего нового; index.md обновить под новые компоненты/состояния.
- Проверка: babel-компиляция скрипта, ручной тест юзером (эндпоинты recommendations/PUT формата подтверждаем вместе через девтулзы при необходимости).