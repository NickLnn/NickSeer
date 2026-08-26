# NickSeer patch — Gluetun auth + Radarr/Sonarr auto-fill

This patch fixes two things:

1. **Gluetun `401 Unauthorized`** — Gluetun v3.40+ makes its control server
   private by default. NickSeer now sends an **API key** (or Basic Auth), and
   the Settings page has fields for it.
2. **Radarr/Sonarr root folders + quality profiles** now **auto-populate as
   dropdowns** right after you click **Test connection**.

## Files in this patch (drop-in replacements)

Copy these over the same paths inside your project on the NAS
(`/volume1/docker/nickseer/`), overwriting the old ones:

```
nickseer/server/config.js
nickseer/server/services/gluetun.js
nickseer/public/js/settings.js
```

No other files change. Nothing else on the NAS is touched.

## Apply it (SSH)

```bash
cd /volume1/docker/nickseer
# ...copy the 3 files into place (scp or File Station), then rebuild:
docker compose up -d --build
```

Then hard-refresh the browser (Ctrl+F5) so the new settings.js loads.

---

## IMPORTANT — you must also turn on auth ON Gluetun itself

NickSeer can only send a key; Gluetun has to *expect* one. Pick ONE option
and add it to your **Gluetun** container, then restart Gluetun.

### Option A — API key (recommended)
1. Generate a key:
   ```bash
   docker run --rm qmcgaw/gluetun genkey
   ```
2. Add this to Gluetun's environment (docker-compose), using that key:
   ```yaml
   environment:
     - HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE={"auth":"apikey","apikey":"PASTE_KEY_HERE"}
   ```
3. Restart Gluetun.
4. In NickSeer → Settings → **Gluetun** → paste the same key in **API Key** →
   Test connection.

### Option B — Basic auth
```yaml
environment:
  - HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE={"auth":"basic","username":"nick","password":"secret"}
```
Then enter the username/password in NickSeer → Settings → Gluetun.

### Option C — no auth (quick test only, discouraged)
```yaml
environment:
  - HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE={"auth":"none"}
```
Leave the NickSeer key fields blank.

---

## Radarr/Sonarr — new flow
1. Settings → **Radarr** (or Sonarr) → enter URL + API key.
2. Click **Test connection**.
3. The **Quality Profile** and **Root Folder** dropdowns fill automatically
   from your server. Pick the ones you want → **Save**.
