<div align="center">
  <br />
  <h1>seWer</h1>
  <p><em>a dark little music player for windows · streams from soundcloud</em></p>
  <br />

  [![electron](https://img.shields.io/badge/electron-41-0d0d0d?style=flat-square&logo=electron&logoColor=9b7dff)](https://www.electronjs.org/)
  [![react](https://img.shields.io/badge/react-18-0d0d0d?style=flat-square&logo=react&logoColor=9b7dff)](https://react.dev/)
  [![platform](https://img.shields.io/badge/windows-only-0d0d0d?style=flat-square&logo=windows11&logoColor=9b7dff)](https://github.com/despoyledporcelain/seWer)
  [![status](https://img.shields.io/badge/status-wip-0d0d0d?style=flat-square&logoColor=white&color=0d0d0d&labelColor=9b7dff)](https://github.com/despoyledporcelain/seWer)

  <br />

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   ╔══════╗   Cloud Nothings                          │
│   ║  ▶   ║   I'm Not Part of Me                     │
│   ╚══════╝                                           │
│            ────────────────────░░░░░░   2:34 / 4:12  │
│                                                      │
│   ◀◀   ⏮   ▶   ⏭   ▶▶                              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

  <br />
</div>

---

## overview

seWer is a frameless desktop music player built on Electron. no UI framework bloat — just React 18 loaded from CDN, compiled in the browser via Babel. everything lives in one HTML file.

the aesthetic: pitch-black background, purple accents, spring-physics buttons, canvas waveform. built to feel good to use, not just look good in screenshots.

---

## features

```
sidebar          58px · nav icons · collapsible library toggle · settings
library panel    collapsible with fluid animation · search filter
player           album art (breathing gradient + spinning disc)
                 wave progress bar · canvas-drawn · drag to seek
                 playback controls with magnet physics
                 shuffle · repeat
volume           vertical canvas slider · 28px · drag up/down
settings         autoplay · crossfade · quality · accent color
                 animations · compact mode · tray · autostart
transitions      circle reveal (home → player) · hero art animation
```

---

## stack

| layer | what |
|---|---|
| runtime | [Electron](https://www.electronjs.org/) 41 |
| ui | React 18 via CDN · Babel standalone (no bundler) |
| font | [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) |
| canvas | wave progress bar · volume slider |
| physics | custom spring hook (`useMagnet`) — rAF loop |

zero config. no webpack, no vite, no typescript, no linter.

---

## install

```bash
git clone https://github.com/despoyledporcelain/seWer
cd seWer
npm install
npm start
```

build a distributable `.exe`:

```bash
npm run build
```

---

## structure

```
seWer/
├── main.js              electron main — BrowserWindow, IPC, titlebar
├── renderer/
│   ├── index.html       entire UI (~1000 lines: styles + JSX + logic)
│   └── preload.js       contextBridge → minimize / maximize / close
└── package.json
```

---

## roadmap

- [x] part 1 — UI / frontend (static, placeholder tracks)
- [ ] part 2 — SoundCloud parsing
- [ ] part 3 — audio engine
- [ ] part 4 — integration

---

<div align="center">
  <sub>built by <a href="https://github.com/despoyledporcelain">despoyledporcelain</a></sub>
</div>
