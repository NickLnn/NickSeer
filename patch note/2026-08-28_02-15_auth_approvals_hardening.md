# NickSeer Patch Note — 2026-08-28 02:15
**Scope:** Authentication Enforcement, Request Gating, Approvals Workflow, Live Settings Sync, Server Hardening & Container Resilience.

### Summary of Changes:
- Enabled `auth.enabled`, `auth.approvals`, and `plexAuth.enabled` in `config/settings.json`.
- Gated non-admin user requests (`Babis`) into approval queue.
- Added "Sign in with Plex" button on login and logout screens.
- Added `PATCH /api/requests/:id` to modify pending request profiles, root folders, and tags.
- Added inline `✏️ Edit` button and metadata chips in `public/js/approvals.js`.
- Implemented atomic configuration saving (`settings.json.tmp` -> `fs.renameSync`) with `settings.bak.json` rotation and disk `mtimeMs` change detection in `server/config.js`.
- Implemented graceful shutdown (`SIGTERM`/`SIGINT`) in `server/index.js`.