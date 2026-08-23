# Test database policy

- `nexus_erp_test`: integration suites. Every suite owns uniquely identified tenant-local fixtures and removes only its own records.
- `nexus_bootstrap_isolated_test`: production-bootstrap suite only. The dedicated runner migrates it, rejects foreign tenants, and the suite cleans only its fixed VAT/email/system catalog identifiers.
- E2E: uses the separate test database selected by Playwright configuration; it must always retain the `_test` suffix.

Production-bootstrap must be invoked with `npm run test:integration:bootstrap`. The runner never targets `nexus_erp_test` and refuses any database name other than `nexus_bootstrap_isolated_test`.
