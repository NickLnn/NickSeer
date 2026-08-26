# NickSeer 🎬

A self-hosted, family-friendly discovery hub for Plex — trending, Box Office,
AI-powered suggestions, Live Streaming stats, and one-click requests to
Radarr/Sonarr, all in a Netflix-style UI.

> **This repo contains NO personal data and NO API keys.** All your Plex,
> TMDB, OMDb, Radarr/Sonarr, SABnzbd, and Gluetun credentials are entered
> **inside the app** (Settings → each service) after you deploy it, and are
> stored only in your own `config/` folder — never in this repository.

## ✨ Features
- Home feed personalized from your Plex/Tautulli watch history
- AI Suggestions (local LLM via Ollama/llama.cpp, or OpenAI)
- IMDb ratings + real streaming service logos (Netflix, Disney+, Prime,
  HBO Max, Apple TV+, Paramount+, Peacock)
- Weekly Box Office (real data via Box Office Mojo)
- Live Streaming — see what's playing on your Plex server right now
- One-click Request → Radarr / Sonarr, with an optional Approvals workflow
- Multi-user logins (local accounts, or "Sign in with Plex")

## 🚀 Quick Start (Docker Compose)

```bash
git clone https://github.com/<your-username>/nickseer.git
cd nickseer
docker compose up -d --build
```

Then open **http://\<your-nas-ip\>:5056** — a first-run wizard walks you
through connecting your own Plex, TMDB, Radarr/Sonarr, etc. Nothing is
pre-configured; every credential is entered by you, live, in the browser, and
saved only to your local `./config/settings.json` (which is **not** part of
this repo and is `.gitignore`d).

## 🐳 Running with Docker

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
      - ./config:/app/config   # stores your settings & API keys — created automatically on first run
```

1. Save this as `docker-compose.yml` in a folder of your choice.
2. Run:
   ```bash
   docker compose up -d
   ```
3. Open `http://<your-server-ip>:5056` and enter your API keys under **Settings**.

### Requirements
- Docker + Docker Compose
- A [TMDB API key](https://www.themoviedb.org/settings/api) (free)
- Your Plex server URL + token
- Optional: Tautulli, Radarr, Sonarr, SABnzbd, Gluetun, OMDb key, a local or
  OpenAI-compatible AI endpoint

## 👨‍👩‍👧 Sharing this with family
Give them the URL (or a Cloudflare Tunnel URL if you've published it) and,
if you've enabled login in **Settings → Users**, either:
- create a **local account** for them (Settings → Users → Add user), or
- let them **"Sign in with Plex"** — this auto-creates their NickSeer account
  using their own Plex login (no password to hand out).

## 🔒 Publishing this repo safely
If you're forking/uploading your own copy of this project:
- `config/` is already in `.gitignore` and `.dockerignore` — your keys never
  leave your NAS.
- Never commit `config/settings.json`. If you ever did by mistake, **rotate
  every key in it immediately** (TMDB, OMDb, Plex token, Radarr/Sonarr API
  keys) and remove the file from git history.
- Run `bash scripts/scan-for-secrets.sh` before every push (included in this
  kit) — it fails the commit if it finds anything that looks like a live key.

## 🛠️ Updating
```bash
git pull
docker compose up -d --build
```
Your `config/` folder is untouched by updates — nothing to reconfigure.

## License
MIT — do whatever you want with it, just don't blame me if the AI suggests a
bad movie. 😄
