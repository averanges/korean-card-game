# GitHub Pages backend diagnosis — 2026-10-20

## Confirmed cause

The public branch `multiplayer` points to `8566cfba7b7a7b40d2ebfc13df784d4b77dca613`, including the Node migration. Its Pages run completed successfully:
https://github.com/averanges/korean-card-game/actions/runs/39435793166

However, the currently served `build-info.json` identifies commit `6738ae7a906f2046b88ec36842c3b292da95f996`. Its entry is `/korean-card-game/assets/index-DxVsbKIX.js`; that JS sets the actual room endpoint to Cloudflare and contains no Render API URL. The workflow at that commit hardcodes `VITE_ROOM_API_BASE` to Cloudflare and does not read repository variables or supply `VITE_ROOM_HEALTHCHECK`.

This is explained by the deployments history, not just browser caching: after the newer commit was successfully deployed at 14:10 UTC, the older SHA was deployed again at 14:18 and 14:26 UTC. The old run is now attempt 5:
https://github.com/averanges/korean-card-game/actions/runs/39402304645

Re-running an old run reuses its old revision/workflow. Adding variables cannot change a hardcoded environment value in that workflow. A fresh dispatch of the current workflow on `multiplayer` is required after publishing this fix. Existing historical workflows cannot be retroactively protected by edits to the current branch; do not re-run those historical runs.

## Local corrections

- Build-job environment reads both repository variables without an implicit Cloudflare fallback. Build and verification steps receive identical values. The `github-pages` environment is attached only to deployment; this fix deliberately uses repository variables for the build.
- A revision check refuses a build when its SHA is no longer the tip of `multiplayer`.
- Pages builds require explicit API and healthcheck settings. Render requires healthcheck `1`. Vite's resolved configuration must match the supplied environment, preventing accidental overrides.
- Scan every emitted JS asset: a Render build must contain the expected endpoint and must not contain the old Cloudflare API URL. Missing/mixed configuration fails before artifact upload.
- Add public, non-secret `rooms.apiBase`, `rooms.healthcheck`, and `rooms.backend` to `build-info.json`; the verification step compares these with the job environment.
- Explicit Cloudflare configuration with healthcheck `0` remains valid for intentional rollback. Other hosting targets and runtime/game/server code are unchanged.

`vite.config.mjs` only selects the hosting base. Build scripts did not override the API. The ignored local `.env.local` selects the local development Worker, but explicit process variables take precedence; the tested Render build confirmed this.

## Checks

- Four Node guard tests passed: missing settings; invalid Render healthcheck/credential-bearing URL; wrong/mixed JS; explicit rollback.
- `npm run build` passed, including TypeScript validation, with Pages base and Render API/healthcheck `1`.
- Static verification passed for 17 JS/CSS/WebP/SVG assets and the 404 fallback. No old Cloudflare API URL in production JS.
- Eight browser checks passed using the actual local production build: assets, menu, real solo action, solo reload, multiplayer navigation/reload, direct room link/reload, diagnostics, health HTML with JavaScript disabled. These are frontend routing/build checks, not a new remote two-player server test.
- `git diff --check` passed.

No commit, push, repository-variable edits, workflow dispatch or deployment was performed. Render and Cloudflare were not changed. Private variable values were not accessible through public GitHub metadata; their presence is supplied by the user, and future builds now validate them explicitly.

## Verify after an authorized publication

1. Publish the fix on `multiplayer`, then use Actions → Deploy GitHub Pages → Run workflow → branch `multiplayer`. Do not use Re-run jobs on run `39402304645` or any older revision.
2. Confirm that the run's SHA is the new commit and that Build and Verify Pages build both pass.
3. Open `https://averanges.github.io/korean-card-game/build-info.json` with a cache-busting query. Expect the new commit and `rooms: {apiBase: "https://korean-card-game.onrender.com", healthcheck: "1", backend: "render"}`.
4. Open the entry asset named in that metadata: it must contain the Render URL and no old Cloudflare API endpoint. The new hash is expected to differ from the historical entry above; do not hardcode a local hash.
5. Reload the game with DevTools cache disabled, create a room and verify HTTP `/health`, POST `/api/rooms`, and game WebSocket use Render. Room invitation/navigation remains on GitHub Pages.
