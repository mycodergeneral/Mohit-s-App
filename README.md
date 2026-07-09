# 🏡 Famly — your family's cozy corner of the internet

A dreamy online gathering space where your whole family can **chat, share photos, and battle it out in party games** — all in one room, joinable in seconds with a QR code.

**Famly is a mobile app**: it's an installable PWA that runs full-screen from the home screen on both **iOS and Android** (and it's Capacitor-ready if you want to ship it to the App Store / Play Store — see below).

![theme: Saffron](https://img.shields.io/badge/theme-Saffron-ff9933) ![players](https://img.shields.io/badge/players-2%2B%20(best%20with%203%2B)-f07d12)

## ✨ What's inside

| | |
|---|---|
| 💬 **Family chat** | Real-time chat with photo sharing (photos are auto-resized so they send instantly) |
| 📲 **One-tap invites** | A QR code opens the room with the code pre-filled — grandparents can join in one scan |
| 🟩 **Wordle Race** | Everyone races to crack the *same* secret word. You see rivals' color progress live (never their letters!). Fewer guesses + faster solve = more points |
| 🚩 **Flag Guesser** | Whose flag is that? 4 options, 15 seconds, speed bonus for quick fingers |
| 🧠 **Quote & Trivia Quiz** | “Who said it?” famous quotes + family trivia, fully gamified |
| 👑 **Live leaderboard** | Points persist across games; the current family champion is crowned in a ribbon everyone sees, and every win is announced in chat with a confetti celebration |
| 🎨 **Dynamic themes** | Switch anytime: **Saffron** (Apple-calm frosted glass with a warm saffron accent — the default), **Pixel Pastel** (dreamy retro), **Material You** (soft tonal), **Midnight Dream** (cozy dark). Typography is **Google Sans Flex** throughout |
| 📱 **Mobile app** | Installable PWA: full-screen standalone mode, home-screen icon, offline app shell via a service worker |

## 🚀 Run it

```bash
npm install
npm start
# → http://localhost:3000
```

One person creates the room and shows the QR code — everyone else on the same network (or via a tunnel/deployment) scans it, picks an emoji face, and they're in.

> **Tip for phones on your Wi-Fi:** start the server, then share `http://<your-computer's-LAN-IP>:3000` — the QR code automatically encodes whatever address you opened the app from.

## 📱 Install it like a native app

- **Android (Chrome):** open the app → tap the **"Install app" / "Add to Home screen"** prompt. It launches full-screen with its own icon, no browser chrome.
- **iOS (Safari):** open the app → Share sheet → **"Add to Home Screen"**. Same thing: standalone, full-screen, saffron icon.

> **Note:** install prompts and the service worker require HTTPS (or `localhost`), so deploy it or use a tunnel (e.g. `npx localtunnel --port 3000`) when installing on phones.

### Shipping to the App Store / Play Store

The app is a clean separation of static client (`public/`) + Socket.IO server, so wrapping it in native shells with [Capacitor](https://capacitorjs.com) is straightforward:

```bash
npm i -D @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init Famly com.yourfamily.famly --web-dir public
npx cap add ios && npx cap add android
```

Point the client at your deployed server URL (`io('https://your-server')` in `public/js/app.js`) and run `npx cap open ios` / `npx cap open android` to build in Xcode / Android Studio.

## 🎮 How games work

1. Anyone taps a game in the **Games** tab — a lobby opens and the whole family gets pinged.
2. Players tap **Join** (min 2 — the host can cap the table at 2/3/4 or leave it open to all).
3. The host hits start. Points fly, standings update live after every question, and the winner gets a trophy screen + chat announcement so *everyone knows who's boss*.

## 🛠 Tech

- **Server:** Node.js, Express, Socket.IO — all game logic is server-authoritative (no cheating from the browser console, kids 👀)
- **Client:** zero-build vanilla JS + CSS custom-property themes
- **QR codes:** generated server-side as crisp SVGs

Rooms live in memory — perfect for a gathering, gone when everyone leaves.
