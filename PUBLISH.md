# How to publish NickSeer to GitHub safely (step-by-step)

Think of this like Windows Sysprep: you're "generalizing" your personal,
configured NickSeer install into a clean, reusable image that anyone (your
family) can deploy fresh — without any of YOUR data or keys along for the ride.

## Why this is already safe by design
Your API keys and Plex token live in **`config/settings.json`**, which is
**not part of the app's source code** — it's a file NickSeer writes at runtime
into a folder you mount as a Docker **volume** (`./config:/config`). The
Dockerfile never copies `config/` into the image, and this kit's `.gitignore`
ensures git never tracks it either. So:
- **The GitHub repo** (source code) → safe to make public. No keys in it.
- **The Docker image** (built from that code) → safe to publish. No keys baked in.
- **`config/settings.json`** → stays on YOUR NAS only, forever local.

## Step 1 — Prepare your project folder
Copy these files from this kit into the ROOT of your NickSeer project
(where `Dockerfile` and `docker-compose.yml` already live), merging with
what's there:
```
.gitignore
.dockerignore
README.md
PUBLISH.md
config.example/settings.example.json
docker-compose.family.yml
scripts/scan-for-secrets.sh
.github/workflows/publish.yml
```

## Step 2 — Verify nothing sensitive is tracked
```bash
cd /volume1/docker/nickseer
git init                      # if you haven't already
git add .
git status                    # config/ should NOT appear in the list at all
bash scripts/scan-for-secrets.sh
```
If `config/` shows up in `git status`, STOP — check your `.gitignore` is in
the repo root and re-run `git rm -r --cached config` if it was already added.

## Step 3 — Create the GitHub repo
1. Go to github.com → **New repository** → name it `nickseer` → choose
   **Public** (or Private if you only want family with repo access to pull it)
   → do **not** initialize with a README (you already have one).
2. Push:
```bash
git remote add origin https://github.com/<your-username>/nickseer.git
git branch -M main
git commit -m "Initial public release"
git push -u origin main
```

## Step 4 — Let GitHub Actions build & publish the image automatically
The included `.github/workflows/publish.yml` builds a Docker image on every
push to `main` and publishes it to **GitHub Container Registry** at
`ghcr.io/<your-username>/nickseer`. No setup needed — it uses GitHub's
built-in token. After your first push, check the **Actions** tab on GitHub;
once it's green, your image is live.

## Step 5 — Family deployment (two options)

### Option A — They build from source (like you did)
```bash
git clone https://github.com/<your-username>/nickseer.git
cd nickseer
docker compose up -d --build
```

### Option B — They just pull your published image (faster, no source needed)
Give them `docker-compose.family.yml` (edit the username inside it first):
```bash
docker compose -f docker-compose.family.yml up -d
```
Either way, they open `http://<their-ip>:5056` and enter **their own** Plex
URL/token, TMDB key, etc. in the Settings UI — completely separate from yours.

## Step 6 — Before every future push
```bash
bash scripts/scan-for-secrets.sh
```
Make it a habit (or wire it into a git pre-push hook — see below).

### Optional: auto-run the scanner on every push
```bash
cp scripts/scan-for-secrets.sh .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```
Now `git push` will refuse to push if it finds anything key-shaped.

## If you ever DO leak a key by accident
1. Rotate it immediately at the source (TMDB, OMDb, Plex — sign out all
   devices to invalidate the token, Radarr/Sonarr → Settings → General →
   regenerate API key).
2. Remove it from git history (not just the latest commit):
   ```bash
   git log --all --oneline -- config/settings.json   # see if/when it was committed
   # if it was, use the BFG Repo-Cleaner or `git filter-repo` to purge it from history
   ```
3. Re-push and force the rewritten history if the repo is already public.
