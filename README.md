# 🏡 Famly — your family's cozy corner of the internet

A dreamy, pastel online gathering space where your whole family can **chat, share photos, and battle it out in party games** — all in one room, joinable in seconds with a QR code.

![theme: Pixel Pastel](https://img.shields.io/badge/theme-Pixel%20Pastel-c9b8f0) ![players](https://img.shields.io/badge/players-2%2B%20(best%20with%203%2B)-a78bfa)

## ✨ What's inside

| | |
|---|---|
| 💬 **Family chat** | Real-time chat with photo sharing (photos are auto-resized so they send instantly) |
| 📲 **One-tap invites** | A QR code opens the room with the code pre-filled — grandparents can join in one scan |
| 🟩 **Wordle Race** | Everyone races to crack the *same* secret word. You see rivals' color progress live (never their letters!). Fewer guesses + faster solve = more points |
| 🚩 **Flag Guesser** | Whose flag is that? 4 options, 15 seconds, speed bonus for quick fingers |
| 🧠 **Quote & Trivia Quiz** | “Who said it?” famous quotes + family trivia, fully gamified |
| 👑 **Live leaderboard** | Points persist across games; the current family champion is crowned in a ribbon everyone sees, and every win is announced in chat with a confetti celebration |
| 🎨 **Dynamic themes** | Switch anytime: **Pixel Pastel** (dreamy retro default), **Cupertino** (Apple-calm frosted glass), **Material You** (soft tonal), **Midnight Dream** (cozy dark) |

## 🚀 Run it

```bash
npm install
npm start
# → http://localhost:3000
```

One person creates the room and shows the QR code — everyone else on the same network (or via a tunnel/deployment) scans it, picks an emoji face, and they're in.

> **Tip for phones on your Wi-Fi:** start the server, then share `http://<your-computer's-LAN-IP>:3000` — the QR code automatically encodes whatever address you opened the app from.

## 🎮 How games work

1. Anyone taps a game in the **Games** tab — a lobby opens and the whole family gets pinged.
2. Players tap **Join** (min 2 — the host can cap the table at 2/3/4 or leave it open to all).
3. The host hits start. Points fly, standings update live after every question, and the winner gets a trophy screen + chat announcement so *everyone knows who's boss*.

## 🛠 Tech

- **Server:** Node.js, Express, Socket.IO — all game logic is server-authoritative (no cheating from the browser console, kids 👀)
- **Client:** zero-build vanilla JS + CSS custom-property themes
- **QR codes:** generated server-side as crisp SVGs

Rooms live in memory — perfect for a gathering, gone when everyone leaves.
