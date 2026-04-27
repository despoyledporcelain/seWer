<div align="center">
  <br />
  <h1>seWer</h1>
  <p><em>desktop music player for windows · local files + soundcloud (wip)</em></p>
  <br />

  [![electron](https://img.shields.io/badge/electron-41-0d0d0d?style=flat-square&logo=electron&logoColor=9b7dff)](https://www.electronjs.org/)
  [![react](https://img.shields.io/badge/react-18-0d0d0d?style=flat-square&logo=react&logoColor=9b7dff)](https://react.dev/)
  [![platform](https://img.shields.io/badge/windows-only-0d0d0d?style=flat-square&logo=windows11&logoColor=9b7dff)](https://github.com/despoyledporcelain/seWer)
  [![status](https://img.shields.io/badge/status-wip-0d0d0d?style=flat-square&logoColor=white&color=0d0d0d&labelColor=9b7dff)](https://github.com/despoyledporcelain/seWer)
</div>

---

## overview

frameless electron player. react 18 from cdn, compiled in-browser by babel — no bundler, no config. everything lives in one html file.

---

## features

```
sidebar          nav icons · collapsible library · settings
library          search filter · track list with thumbnails
player           album art from file tags (jpg/png embedded)
                 wave progress bar · canvas · drag to seek
                 shuffle · repeat · crossfade
volume           vertical canvas slider · drag up/down
transitions      hero animation — art flies between grid and player
                 spring-physics magnet buttons
settings         autoplay · crossfade · local music folder · tray · autostart
```

---

## stack

| layer | what |
|---|---|
| runtime | [Electron](https://www.electronjs.org/) 41 |
| ui | React 18 via CDN · Babel standalone |
| font | [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) |
| tags | [music-metadata](https://github.com/borewit/music-metadata) — reads embedded cover art |
| canvas | wave progress bar · volume slider |
| physics | custom spring hook (`useMagnet`) |

---

## install

```bash
git clone https://github.com/despoyledporcelain/seWer
cd seWer
npm install
npm start
```

build `.exe`:

```bash
npm run build
```

---

## structure

```
seWer/
├── main.js              electron main — window, IPC, folder scan, tag reading
├── renderer/
│   ├── index.html       entire UI (~1310 lines: styles + JSX + logic)
│   └── preload.js       contextBridge — window controls, file/settings/cover IPC
└── package.json
```

---

## roadmap

- [x] part 1 — ui / frontend
- [x] part 3 — local file playback · album art from tags
- [ ] part 2 — soundcloud parsing
- [ ] part 4 — soundcloud integration

---

<div align="center">
  <sub>built by <a href="https://github.com/despoyledporcelain">despoyledporcelain</a></sub>
</div>
