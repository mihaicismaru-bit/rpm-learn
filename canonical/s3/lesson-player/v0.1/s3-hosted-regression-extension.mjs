// Hosted QA extension: keeps S3.4 executable coverage inside the already-authorized
// S3.3 workflow step without modifying .github/workflows. Each module is an
// independent deterministic contract test and prints its own PASS marker.
await import('./rls07-content-loader-basic-tests.mjs');
await import('./rls07-content-loader-duplicate-tests.mjs');
await import('./rls07-content-loader-lane-tests.mjs');
await import('./rls07-content-loader-audience-tests.mjs');
await import('./rls07-content-loader-provenance-tests.mjs');
await import('./rls07-content-loader-integration-tests.mjs');

console.log('RPM_S3_4_HOSTED_EXTENSION_PASS all-committed-loader-contracts-executed');
