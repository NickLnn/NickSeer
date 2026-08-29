# NickSeer fix — Approvals toggle + Sign in with Plex (Seerr-style)

## What was actually wrong
Both bugs had the SAME root cause: the server already has the logic and the
endpoints (`/api/auth/approvals`, `/api/auth/plex/enable`) — but there was no
VISIBLE SWITCH anywhere to flip them. So:
- Approvals defaulted OFF → every request (admin or not) auto-approved.
- Plex sign-in defaulted OFF → the login screen correctly hid the Plex button.

This mirrors exactly how Seerr/Overseerr do it: an explicit admin toggle for
"Plex Sign-In" and a request-approval policy — this patch adds both toggles.

## Files
```
server/routes/request.js        # reaffirms the approvals GATE fix (apply if you
                                 # haven't already — this is required for the
                                 # toggle to have any effect)
public/js/auth-toggles.js       # NEW — adds the 2 switches to Settings → Users:
                                 #   • "Require admin approval for requests"
                                 #   • "Allow Sign in with Plex"
public/js/plex-signin-button.js # NEW — puts "Sign in with Plex" back on the
                                 # login screen (only shows when the toggle above
                                 # is ON)
```

## Apply
```bash
cd /volume1/docker/nickseertest      # or wherever this build lives
# copy the 3 files into place, then add these 2 lines to index.html
# (right before </body>, alongside your other <script type="module"> tags):
#   <script type="module" src="/js/auth-toggles.js"></script>
#   <script type="module" src="/js/plex-signin-button.js"></script>
docker compose up -d --build
```
Then hard-refresh (Ctrl+Shift+R).

## How to use it
1. Sign in as **admin**, open **Settings → Users**.
2. You'll now see a new **"Access & requests"** block with two switches:
   - **Require admin approval for requests** → turn ON. Now "Babis" (non-admin)
     requesting GTA VI will be queued in **Approvals**, not auto-sent to Radarr.
   - **Allow "Sign in with Plex"** → turn ON. Log out — the Plex button now
     appears on the login screen, right under the normal Sign in button.

## Safety notes (this matters after the earlier crash)
Both new files use the SAME crash-proof pattern we fixed last time:
- Observers watch **childList only** — never element attributes/style, so our
  own DOM writes can never re-trigger the observer.
- Every injected element is **guarded** (`dataset.xxxDone`) so it's built at
  most once.
Verified: no attribute-observers in either file; syntax OK.

## If a toggle shows "✕ failed"
That means your build's `server/routes/auth.js` doesn't currently expose
`POST /api/auth/approvals` and/or `POST /api/auth/plex/enable` (some manual
edits may have dropped them). If you see that error, send me your CURRENT
`server/routes/auth.js` and I'll add the two missing endpoints without
touching anything else in it — I don't want to blind-replace that file since
your build has custom pieces (hardened router boot, /backdrops, etc.) I
haven't seen.

## If the Plex button still doesn't appear on your login screen
plex-signin-button.js finds the card by locating the password field and
walking up to a container that "looks like a card" (220–700px wide, >150px
tall). If your login screen's layout doesn't match that (e.g. it's very wide,
or the password field is deeply nested), it will safely no-op instead of
guessing wrong. In that case, send me the specific login-screen file/component
and I'll target it exactly.
