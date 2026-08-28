# NickSeer 🎬

A modern, self-hosted discovery hub and request manager for **Plex** & **Jellyfin** — featuring personalized recommendations, Box Office charts, AI taste curation, live streaming activity, and seamless one-click requests to **Radarr** & **Sonarr**, wrapped in a sleek Netflix/Apple-inspired UI.

> 🔒 **Security Notice:** This repository contains **NO personal data, tokens, or API keys**. All credentials (Plex, TMDB, Radarr, Sonarr, Tautulli, SABnzbd, etc.) are entered interactively in the web UI upon first launch and saved exclusively to your local `./config/` directory — never in this repository or Docker image.

---

## ✨ Key Features

### 🌟 1. Universal IMDb & TMDB Ratings
- **Multi-Tier Fallback Engine:** Official IMDb scores resolved via OMDb API with automatic zero-config fallback to Cinemeta Open Metadata — no API rate limits or missing ratings.
- **Visual Badges:** Official high-contrast yellow `[IMDb]` scores displayed directly on all movie/series posters and detail modals, accompanied by secondary `[TMDB]` ratings.

### 🧠 2. AI Taste Curation (Local LLM & OpenAI)
- **Deep Taste Profiling:** Analyzes your Plex / Tautulli 60-day watch history to determine core genres, dramatic tone, and narrative depth.
- **Smart Filtering:** Intelligent genre affinity scoring automatically filters out children's cartoons, kids' TV, and concert films for viewers who primarily watch mature prestige dramas and thrillers.
- **Contextual Justifications:** Every recommendation includes a concise 4-6 word AI reason (e.g. *"Gritty crime saga with intense drama"*).
- Supports **Ollama**, **llama.cpp**, **LM Studio**, and **OpenAI (GPT-4o-mini)**.

### 📱 3. Seerr-Style Mobile Experience
- **Slide-Out Mobile Drawer (`☰ More`):** Complete navigation drawer providing instant access on smartphones to all categories (*Streaming Services, New Releases, Box Office Top 10, Coming Soon, Live Streaming, System Info, Downloads*).
- **Centered Responsive Search Grid:** Vertical scrolling CSS grid optimized for mobile touch screens with zero horizontal drift.
- **Bottom-Sheet Modal:** Full viewport clearance over mobile navigation bars with thumb-friendly action buttons.

### 🔐 4. Multi-User Profiles
- **Dynamic Trending Wallpaper:** Weekly auto-refreshing TMDB poster mosaic with cinematic radial vignette and glassmorphic sign-in card.
- **Plex OAuth & Local Logins:** One-click *"Sign in with Plex"* or local family accounts.
- **"Who's Watching?" Profile Picker:** Switch between family profiles seamlessly.
- **Role-Based Access Control (RBAC):** Gated telemetry (`System Health / Info` and `Live Streaming Activity`) strictly to Administrator accounts.

### 📥 5. Request Management & Approvals Workflow
- **Automated Routing:** Automatically checks Plex library availability; if missing, routes requests directly to Radarr (Movies) or Sonarr (TV).
- **Admin Approvals Queue:** Dedicated tabs (`⏳ Pending`, `✓ Approved`, `✕ Declined`, `All`) with live badge counts and inline request editing (*quality profiles, root folder paths, tags*).

### 🎨 6. High-Definition Vector Branding
- **Pixel-Perfect Vector Artwork:** High-resolution SVGs for Netflix, Disney+, Prime Video, HBO Max, Apple TV+, Paramount+, and dark Aegean NickSeer icons.
- **Live Streaming Sessions:** Real-time stream transcoding decisions, video/audio codecs, and bandwidth meters powered by Tautulli.

---

## 🚀 Quick Start (Docker Compose)

### 1. Recommended `docker-compose.yml`

```yaml
version: "3.8"

services:
  nickseer:
    image: ghcr.io/nicklnn/nickseer:latest
    container_name: nickseer
    restart: unless-stopped
    ports:
      - "5056:5056"
    environment:
      - TZ=Europe/Athens
      - PUID=1000
      - PGID=1000
    volumes:
      - ./config:/config   # Persists all settings, API keys & user accounts
```

### 2. Launch Container
```bash
docker compose up -d
```

### 3. Complete First-Run Setup
1. Open your browser and navigate to **`http://<your-server-ip>:5056`**.
2. The **First-Run Setup Wizard** will guide you through connecting:
   - **TMDB API Key** (Free from [themoviedb.org](https://www.themoviedb.org/settings/api))
   - **Plex Server URL & Token**
   - *(Optional)* **Radarr**, **Sonarr**, **Tautulli**, **SABnzbd**, **Gluetun**, and **Ollama**.
3. Create your Administrator account or enable **"Sign in with Plex"**.

---

## 🔄 Updating & Watchtower Safety

All configurations, credentials, user accounts, and request history reside exclusively in your `./config/` directory.

When updating the container:
```bash
docker compose pull
docker compose up -d
```
Or when managed automatically via **Watchtower**, your settings are **never overwritten or lost**.

---

## 👨‍👩‍👧 Family & Multi-User Sharing

- **Local Family Accounts:** Create standard user accounts in **Settings &rarr; Users** for family members (automatically restricted to request permissions without access to server telemetry or settings).
- **Sign in with Plex:** Allow family members to log in with their existing Plex credentials &mdash; auto-provisions their user profile seamlessly.
- **Approvals Gating:** Standard users submit requests to the approval queue for Admin review.

---

## 🛠️ Build from Source

```bash
git clone https://github.com/NickLnn/NickSeer.git
cd NickSeer
docker compose up -d --build
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.
