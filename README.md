

# 💬 Whisper

> **“Talk freely. No names. No traces.”**
> or
> **“A place to be heard, not seen.”**

---

## 💡 Core Concept

**Whisper** is a learning project that explores how to use **WebSocket** as a **signaling server** and **WebRTC** for **peer-to-peer (P2P)** real-time communication.

The goal isn’t just technical — it’s human. Whisper creates a **safe, ephemeral space** for people to talk openly without fear, judgment, or exposure.

---

## 🎯 Main Goal

To build a platform where anyone can connect and talk — **anonymously**, **instantly**, and **ephemerally** — while learning the fundamentals of **real-time communication technologies**.

### Why

* People often want to talk but don’t know who to talk to.
* Social anxiety, loneliness, and fear of exposure block honest communication.
* Whisper offers **human connection without personal risk.**

---

## 🧠 Learning Focus

This project is designed as a **hands-on learning sandbox** for:

* **WebSocket** → Used as the signaling channel for session setup and coordination.
* **WebRTC** → Handles direct **P2P communication** (audio, video, or data).
* **Frontend integration** → Minimal client UI to establish and manage sessions.
* **Ephemeral design** → Sessions exist only while connected. No persistence, no logs.

---

## 🔑 Core Features

### 🕵️ True Anonymity

* No accounts, no data storage, no logs.
* Each session spawns a **random ID or avatar**.
* **Direct P2P connections** — no server in the middle once connected.

### ⚡ Ephemeral Connections

* Chats exist **only while active**.
* Once disconnected → all gone, forever.
* Every new match = a fresh start.

### 🔄 Swipe-to-Connect 

* Instantly match with random users.
* Swipe or skip to the next.
* Great for short conversations, venting, or meeting new people.

### 🧱 Safety Layer

* Optional **blocking** or **reporting** mechanism.
* “Topic” or “mood” tags (e.g., *Need Advice*, *Just Venting*, *Practice Socializing*).
* Optional **AI helper** for support between sessions.

### 🌿 No Profile, No Pressure

* No usernames. No follower counts. No performance.
* Just two people — for a moment — being real.

---

## 🧩 Architecture Overview

```
Client A  <--- WebRTC (P2P) --->  Client B
     \                           /
      \                         /
       ---- WebSocket Server ----
           (Signaling only)
```

### Stack

* **Frontend**: HTML / CSS / JavaScript
* **Backend**: Node.js + WebSocket (ws)
* **P2P**: WebRTC API (DataChannel + MediaStream)

---

## 🧰 Getting Started

### 1️⃣ Clone the Repo

```bash
git clone https://github.com/MarkJoshua23/whisper.git
cd whisper
```

### 2️⃣ Install Dependencies

```bash
npm install
```

### 3️⃣ Run the Dev Server

```bash
npm run dev
```

### 4️⃣ Open the Client

Visit

```
http://localhost:3000
```

and start whispering anonymously 👻

---

## 🧭 Learning Goals Summary

| Concept               | Technology     | Description                              |
| --------------------- | -------------- | ---------------------------------------- |
| **Signaling**         | WebSocket      | Establishing and negotiating connections |
| **P2P Communication** | WebRTC         | Real-time data/audio/video exchange      |
| **Session Lifecycle** | JS + Node      | Ephemeral, stateless connections         |
| **Anonymity Layer**   | Frontend logic | Random identity, no persistence          |

---

## 🌱 Psychological Insight

> “People crave connection — without consequence.”

Whisper explores **social vulnerability** through **technical anonymity**.
It’s a tool for learning **how to communicate authentically** — and how to build the **tech** that makes that possible.

---

## 🧩 Future Ideas

* AI-assisted conversation reflection
* Mood-based matchmaking
* Voice chat mode
* P2P file or note exchange
* Integration with decentralized identity systems

---

## 📜 License

MIT License — free to learn, modify, and build upon.

---

## 🙌 Acknowledgments

Built as an open learning project to understand:

* Real-time communication protocols
* The psychology of safe conversations
* The design of ephemeral, human-centered digital spaces


