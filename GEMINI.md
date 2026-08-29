# NickSeer Project Guidelines & Operational Rules

## 1. Project Locations
- **Live / Primary Share**: `X:\nickseer` (Mounted drive) OR `\\192.168.31.173\docker\nickseer` (Synology NAS share). 
  - *AGENT INSTRUCTION*: Both point to the exact same location. **Always use `X:\nickseer`** for all operations as it is significantly faster and avoids SMB network path overhead. Only fallback to the UNC path if `X:\` is unavailable.
- **Backup Share**: `\\192.168.31.187\docker\nickseer`
- **Backup Destination**: `Y:\Personal Data\Nick\Backups\nickseer` (`\\192.168.31.187\Synology Backup\Personal Data\Nick\Backups\nickseer`)
- **Local Workspace**: `C:\Users\Nick\Downloads\nickseer`
- **Container URL**: `http://192.168.31.173:5056`
- **Public URL**: `https://nickseer.nickln.gr/` (Published via Cloudflare Tunnel) 
- **GitHub Repository**: `https://github.com/NickLnn/NickSeer`
- **Patch Notes Folder**: `\\192.168.31.173\docker\nickseer\patch note\` (Local/NAS only, NEVER uploaded to GitHub)

## 2. Mandatory Rules for the Assistant

### 🔒 1. Pre-Push Privacy & Zero-Personal-Info Verification
- **MANDATORY AUDIT BEFORE GITHUB PUSH**:
  Before any code is committed or pushed to GitHub, run an automated scan to guarantee ZERO personal data:
  - **No API Keys**: TMDB, OMDb, OpenAI, Radarr, Sonarr, Tautulli, SABnzbd, Gluetun keys.
  - **No Plex Data**: Tokens, machine IDs, server URLs, Plex emails, or OAuth PINs.
  - **No Personal Identifiers**: Real names, family usernames (`NickLn`, `Babis`, `Mom`, `Themis`, `Leda`, etc.), passwords, or password hashes.
  - **No Local Network IPs**: Hardcoded internal IPs (`192.168.x.x`, `10.x.x.x`) must never exist in committed code (only generic input placeholders like `http://192.168.x.x:32400` in UI hints).
  - **No Runtime Files**: `config/`, `*.settings.json`, `.env`, `*.bak`, `.agents/`, and `patch note/` are strictly ignored via `.gitignore`.

### 🚀 2. Pristine First-Run & Watchtower Update Guarantee
- **First-Time User Experience**:
  - A user deploying NickSeer via Docker (`image: ghcr.io/nicklnn/nickseer:latest` with `- ./config:/config`) must experience a completely clean first-run:
    1. Container detects an empty `/config` directory.
    2. Server initializes default template `settings.json` with `configured: false`.
    3. Visiting `http://<server-ip>:5056` launches the First-Run Setup Wizard to enter their own credentials and create their admin account.
- **Watchtower / Automatic Updates Persistence**:
  - All user settings, credentials, users, and request queues live strictly in the mounted volume `/config`.
  - When Watchtower, Synology Container Manager, or `docker compose pull` updates the container image to a new version, the `./config` folder on the host is never modified or overwritten, guaranteeing **zero data loss and zero credential leaks**.

### 🚫 3. GitHub Push Policy (Explicit Approval Required)
- **DO NOT automatically push or upload to GitHub.**
- Work live on the NAS/local environment, generate backups, and create patch notes.
- ONLY commit and push to GitHub when the USER explicitly tests the changes and says "everything ok upload to github" (or similar explicit approval).

### 🛡️ 4. Mandatory Safety Backups Destination
- Before executing any major code modifications or server updates, ALWAYS generate a full backup zip into:
  `Y:\Personal Data\Nick\Backups\nickseer` (or `\\192.168.31.187\Synology Backup\Personal Data\Nick\Backups\nickseer`) and mirror to `\\192.168.31.187\docker\nickseer`.

### 📝 5. Detailed Technical Patch Notes (Local NAS Only)
- **NEVER OVERWRITE PREVIOUS PATCH NOTES.**
- For every new change, feature, or fix:
  1. Create a **new dedicated markdown file** named with the date, time, and topic (e.g. `YYYY-MM-DD - HH-mm - topic-name.md`) in `\\192.168.31.173\docker\nickseer\patch note\`.
  2. Append the new update at the top of `\\192.168.31.173\docker\nickseer\patch note\CHANGES.md` (which serves as the master chronological history).
- The documentation MUST be detailed and technical enough so that other AI models and developers can fully understand the architecture, root causes, exact file changes, parameter names, function signatures, and operational workflows.

### 🐳 6. Docker Compose Instructions
- Whenever changes require `docker compose` actions (such as rebuilding images or adjusting container configuration), explicitly inform the user with the exact commands to run.

### 🎨 7. Authentic Official Brand Assets & High-Quality Vectors (Strict)
- **Strict Brand Integrity**:
  - Always use 100% authentic, official vector SVGs and exact brand colorways for all external services and media providers:
    - **Plex**: Official `#E5A00D` chevron mark.
    - **Radarr**: Official `#FFC230` scanner disc.
    - **Sonarr**: Official `#00C8F8` antenna pulse.
    - **Tautulli**: Official `#00BCD4` chart mark.
    - **IMDb**: Official `#F5C518` badge.
    - **Services**: SABnzbd, Gluetun, OpenAI, Ollama, TMDB, OMDb.
    - **Streaming Networks**: Official high-resolution vector logos for Netflix, Disney+, Apple TV+, Amazon Prime Video, Max, Paramount+, Hulu, Peacock, Crunchyroll, AMC.
  - **Zero Synthetic / Homemade Logos**: Never draw approximate shapes, invent custom icons, or substitute generic emojis for recognized industry brands. Always source and embed genuine official SVG brand vectors for a top-tier premium user experience.


## 3. Architecture & Key Patterns
- **Server Framework**: Zero-dependency custom express-like router in `server/mini.js`.
- **Config Management**: Atomic write (`.tmp` -> `fs.renameSync`) with automatic `settings.bak.json` rotation and disk `mtimeMs` change detection in `server/config.js`.
- **AI Recommendation Engine**: Multi-seed affinity scoring, smart kids/concert exclusion, and LLM taste curation in `server/recommend/ai.js` and `server/recommend/engine.js`.
- **Ratings Engine**: Multi-tier in `server/services/omdb.js` (Tier 1: OMDb API if key valid; Tier 2: Free Cinemeta Open Metadata for official IMDb scores).
- **Approvals & Gating**: Managed in `server/routes/requests.js` with `PATCH /api/requests/:id` and dedicated sub-tabs (`Pending`, `Approved`, `Declined`, `All`) in `public/js/approvals.js`.
- **Role Gating**: Sensitive views (`Info`, `Live Streaming`, `Settings`) and backend telemetry endpoints are strictly restricted to `admin` accounts.
- **Docker Mounts**: `./server:/app/server`, `./public:/app/public`, and `./config:/config` mounted in `docker-compose.yml`.



