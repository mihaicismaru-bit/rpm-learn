await import('./player-ui-adapter-preflight-tests.mjs');
await import('./player-ui-projection-tests.mjs');
await import('./player-ui-render-sanitizer-tests.mjs');
await import('./player-ui-render-command-boundary-tests.mjs');
await import('./player-ui-render-command-determinism-tests.mjs');
await import('./player-ui-render-command-kind-tests.mjs');
await import('./player-ui-render-model-invariants-tests.mjs');
await import('./player-ui-safe-session-port-tests.mjs');
await import('./player-ui-safe-render-smoke.mjs');
await import('./player-ui-safe-render-invariant-binding-tests.mjs');

console.log('RPM_S3_5_HOSTED_EXTENSION_PASS projection sanitizer render-commands invariants session-port pipeline-binding non-dom');
