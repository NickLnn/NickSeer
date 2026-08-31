# NickSeer 🎬

A modern, self-hosted discovery hub and request manager for **Plex** & **Jellyfin** — featuring multi-server Plex synchronization, personalized recommendations, Box Office charts, AI taste curation, live streaming telemetry, and seamless one-click requests to **Radarr** & **Sonarr**, wrapped in a sleek Netflix/Apple-inspired UI.

> 🔒 **Security Notice:** This repository contains **NO personal data, tokens, or API keys**. All credentials (Plex, TMDB, Radarr, Sonarr, Tautulli, SABnzbd, etc.) are entered interactively in the web UI upon first launch and saved exclusively to your local `./config/` directory — never in this repository or Docker image.

---

## ✨ Key Features

### 👑 1. Multi-Server Plex Integration & Ownership Verification
- **Multi-Server Detection:** Seamlessly switches between your owned servers and invited/shared friend servers with instant library section re-scanning.
- **Selective Library Sync:** Choose exactly which movie and TV libraries to scan for ownership and exclude shared friend libraries.
- **Universal IMDb & TMDB Badges:** High-contrast yellow `[IMDb]` scores and secondary `[TMDB]` ratings on all posters and detail modals.

### 📱 2. Native Mobile App Experience (PWA) & Cloudflare Ready
- **Installable PWA (iOS & Android):** Add to Home Screen to run NickSeer as a full-screen native standalone app with zero browser URL bar or browser chrome.
- **Sleek Minimalist Navigation:** Modern vector SVG bottom navigation bar with Apple TV / Netflix styling.
- **Overseerr-Style Season Selector:** Interactive season request table with individual episode counts, master toggles, and smooth bottom-sheet modals.
- **Cloudflare Tunnel Hardened:** Real client IP extraction (`CF-Connecting-IP`), brute-force login rate limiting, security headers, and 24-hour CDN edge caching for static assets.

### 🤖 3. AI Taste Curation (Local LLM & OpenAI)
- **Deep Taste Profiling:** Analyzes your Plex / Tautulli 60-day watch history to determine core genres, dramatic tone, and narrative depth.
- **Smart Filtering:** Intelligent genre affinity scoring automatically filters out children's cartoons, kids' TV, and concert films for viewers who primarily watch mature prestige dramas and thrillers.
- **Contextual Justifications:** Every recommendation includes a concise 4-6 word AI reason (e.g. *"Gritty crime saga with intense drama"*).
- Supports **Ollama**, **llama.cpp**, **LM Studio**, and **OpenAI (GPT-4o-mini)**.

### 🎨 4. Authentic Official Brand Vector Assets
- **Exact Official SVGs:** Directly integrated from official GitHub repositories for **Radarr**, **Sonarr**, **Tautulli**, **Plex**, **SABnzbd**, **Gluetun**, and major streaming platforms (**Netflix**, **Disney+**, **Prime Video**, **Max**, **Apple TV+**, **Paramount+**).

### 👥 5. Netflix-Style Multi-User Profiles & RBAC
- **"Who's Watching?" Profile Picker:** Switch between family profiles seamlessly.
- **Role-Based Access Control (RBAC):** Admin users manage users, approvals, and server settings. Standard user accounts (family/friends) are automatically restricted from viewing backend configurations, server hostnames, or other users' request history.
- **Sign in with Plex:** One-click Plex OAuth authentication that auto-provisions user profiles.

### 📥 6. Request Management & Approvals Workflow
- **Automated Routing:** Automatically checks Plex library availability; if missing, routes requests directly to Radarr (Movies) or Sonarr (TV).
- **Admin Approvals Queue:** Dedicated tabs (`⏳ Pending`, `✓ Approved`, `✕ Declined`, `All`) with live badge counts and inline request editing (*quality profiles, root folder paths, tags*).

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
      # Hardware sensors for accurate Live Streaming thermals & NAS RAM telemetry
      - /sys/class/thermal:/sys/class/thermal:ro
      - /sys/class/hwmon:/sys/class/hwmon:ro
      - /proc/meminfo:/host/proc/meminfo:ro``

### 2. Launch Container
```bash
docker compose up -d
```

### 3. Complete First-Run Setup
1. Open your browser and navigate to **`http://<your-server-ip>:5056`** (or your Cloudflare Tunnel domain).
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

## 🛠️ Build from Source

```bash
git clone https://github.com/NickLnn/NickSeer.git
cd NickSeer
docker compose up -d --build
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.
