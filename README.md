<div align="center">

<br/>

# seWer

<br/>

*a dark, minimal music player.*<br/>*local library. soundcloud. yours.*

<br/>

![](https://img.shields.io/badge/windows-only-1a1a2e?style=flat-square&logoColor=white)
![](https://img.shields.io/badge/electron-41-1a1a2e?style=flat-square&logo=electron&logoColor=white)
![](https://img.shields.io/badge/react-18-1a1a2e?style=flat-square&logo=react&logoColor=white)
![](https://img.shields.io/badge/status-in_development-1a1a2e?style=flat-square)

<br/>

</div>

---

<br/>

seWer — музыкальный плеер с кастомным ui, физикой на кнопках, hero-анимациями между экранами и парсингом soundcloud. тёмная тема, никаких лишних окон, frameless.

<br/>

```
#07070a  ·  #9b7dff  ·  Space Grotesk
```

<br/>

---

<br/>

## запуск

```bash
npm install
npm start
```

```bash
npm run build   # → .exe
```

<br/>

---

<br/>

## стек

| | |
|---|---|
| runtime | electron 41 |
| ui | react 18 · babel standalone (без бандлера) |
| аудио | html5 audio · music-metadata |
| шрифт | space grotesk |
| сборка | electron-builder · nsis |

<br/>

---

<br/>

## дорожная карта

```
✅  ui — home / player / settings / hero-анимации
🔄  soundcloud — парсинг страниц
🔄  аудио движок — soundcloud стриминг
⬜  интеграция всего вместе
```

<br/>

#### → миграция на tauri

> electron уйдёт. следующая крупная версия — **tauri v2** + vite + react.  
> exe похудеет с ~150мб до ~5мб. rust на бэке, фронт без изменений.

<br/>

---

<div align="center">

<br/>

<sub>made with 🖤</sub>

<br/>

</div>
