# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# seWer

музыкальный плеер для windows с парсингом soundcloud.

## стек

- **electron** — desktop-приложение (frame: false, кастомный тайтлбар)
- **html/css/react** — ui через cdn (react 18 + babel standalone, без сборщика)
- **space grotesk** — шрифт (google fonts)

## структура

```
C:\seWer\
├── main.js              # electron main process
├── renderer/
│   ├── index.html       # весь ui (react + стили)
│   └── preload.js       # contextBridge: minimize/maximize/close
├── package.json
└── .gitignore
```

## команды

```bash
npm start          # запуск в dev-режиме (electron .)
npm run build      # сборка .exe через electron-builder (NSIS)
```

нет линтера, нет тестов.

## важно

**никогда не запускать `npm start` или electron самостоятельно для проверки** — пользователь запускает сам.

## архитектура ui

весь код рендерера — один файл `renderer/index.html` (~900 строк): стили, jsx-компоненты, логика — всё вместе. babel компилирует jsx в браузере (`type="text/babel"`).

**ipc-мост** (`preload.js`): `window.electronAPI.{minimize,maximize,close}` → `ipcMain.on('win-*')` в `main.js`.

**react-компоненты:**
- `useMagnet(strength)` — hook: spring-физика смещения кнопок к курсору (rAF)
- `WaveProgressBar` — canvas-волна с beat-анимацией, drag для seek
- `ThinVolumeSlider` — вертикальный canvas-слайдер (28px), drag вверх/вниз
- `HomeView` — сетка карточек треков
- `PlayerView` — боковая библиотека + центральный плеер
- `App` — переключение view + circle-reveal анимация через `clipPath`

полная карта с номерами строк → [`renderer/index.md`](renderer/index.md)

два вида (view):
- **home** — сетка карточек треков
- **player** — боковая библиотека + центральный плеер + слайдер громкости

переход home → player и обратно: hero-clone анимация (обложка летит между карточкой и плеером)

**заглушки**: `TRACKS` — статичный массив 8 треков `{id, title, artist, duration, color}`.

## дизайн

- тёмная тема: `#07070a` фон, `#9b7dff` акцент
- кастомный тайтлбар 28px сверху (`-webkit-app-region: drag`)
- магнитная физика на кнопках (useMagnet hook)
- волновой прогресс-бар на canvas
- вертикальный слайдер громкости на canvas
- обложка с дышащим градиентом + spinning disc

## переходы между view (важно)

оба view (`home` и `player`) **всегда смонтированы** — видимость через `homeVisible`/`playerVisible` (`opacity` + `pointerEvents`). `SettingsView` тоже всегда в dom, управляется через `visible={view==='settings'}`.

все смены view делаются в **одном react-батче** — `setHomeVisible` + `setPlayerVisible` + `setView` вместе, без `setTimeout`/`requestAnimationFrame`. это даёт настоящий кросс-фейд без чёрного экрана.

**HeroClone** — портал в `document.body`, летит css-transition за 340мс:
- вперёд (home→player): из карточки в центр плеера
- назад (player→home): из центра плеера в карточку (`reverse=true`)
- пока clone летит — реальный `AlbumArt` в плеере скрыт (`opacity:0`), target-карточка в home grid тоже скрыта (`artHidden`)
- когда `heroExiting`/`reverseHeroExiting` — clone fadeout, арт мгновенно открывается

`libCollapsed` учитывается при расчёте `targetRect` — иначе clone летит не туда.

## план разработки

- [x] часть 1 — ui/фронтенд (статичный, заглушки)
- [ ] часть 2 — парсинг soundcloud (страницы)
- [ ] часть 3 — аудио движок
- [ ] часть 4 — интеграция

## гитхаб

https://github.com/despoyledporcelain/seWer
