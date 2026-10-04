# S3.5 render sanitizer checkpoint

Status: preflight/static hardening only. S3.4 hosted gate remains pending; DOM integration and TEST publication remain closed.

Material code: `canonical/s3/lesson-player/v0.1/player-ui-render-sanitizer.mjs`.

The safe projection is whitelist-only, keeps only public progress/current fields, replaces replay detail with a bounded integrity summary, accepts only RLS-07 in this preflight path, uses deterministic non-identity presentation ordering for ORDER_WORDS, keeps audio/speaking disabled, and exposes a four-method sanitized session port.

Local deterministic QA marker: `RPM_S3_5_UI_RENDER_SANITIZER_PASS whitelist-only no-extra-runtime-fields deterministic-order-words RLS07-only safe-session-port audio-speaking-deferred`.

Sanitizer blob readback: `e4c504f9651be5e910fce8b9f9e52775be44df3c`.

No S2 baseline, DOM, main or gh-pages file was changed by this checkpoint.

NEXT EXACT ACTION: keep S3.4 fail-closed; continue non-DOM S3.5 hardening and bind the eventual adapter to the safe projection path only after the preceding gate is available.
