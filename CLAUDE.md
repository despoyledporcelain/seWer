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

## запуск

```
npm start
```

## архитектура ui

два вида (view):
- **home** — сетка карточек треков
- **player** — боковая библиотека + центральный плеер + слайдер громкости

переход home → player: анимация circle reveal (clipPath)

## дизайн

- тёмная тема: `#07070a` фон, `#9b7dff` акцент
- кастомный тайтлбар 28px сверху (`-webkit-app-region: drag`)
- магнитная физика на кнопках (useMagnet hook)
- волновой прогресс-бар на canvas
- вертикальный слайдер громкости на canvas
- обложка с дышащим градиентом + spinning disc

## план разработки

- [x] часть 1 — ui/фронтенд (статичный, заглушки)
- [ ] часть 2 — парсинг soundcloud (страницы)
- [ ] часть 3 — аудио движок
- [ ] часть 4 — интеграция

## гитхаб

https://github.com/despoyledporcelain/seWer
