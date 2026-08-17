# Open Banking V1

## Scope

Open Banking V1 is a provider-independent, read-only foundation. BNL / Banca Nazionale del Lavoro / BNP Paribas Italy is the first discovery target. Nexus does not initiate payments or transfers and never asks for home-banking usernames or passwords.

## Architecture

`OpenBankingProvider` isolates institution discovery, consent, callback, accounts, balances, transactions, refresh and revoke. Treasury depends only on normalized DTOs. The built-in mock implements the complete contract; a live adapter must obtain BNL's institution ID and authorization endpoints from the selected regulated provider's official API. Direct BNL PSD2 endpoints are intentionally not hardcoded.

The manual sync service is scheduler-ready:

```
provider transaction -> normalize -> BankStatement / BankStatementLine -> Treasury reconciliation
```

A sync never creates `FinancialMovement`. Imported accounts can remain unlinked. Statements and lines are created only after the provider account is mapped to a compatible Treasury `FinancialAccount` in the same Company, same Location and currency.

## Consent and security

Callback state is 256-bit random data, stored only as a SHA-256 digest in `IdempotencyRecord`, expires after ten minutes and is consumed once. Company and Location come from the authenticated server context. Every lookup is tenant-scoped and mapping rejects cross-company/cross-location data.

Access and refresh tokens are encrypted at rest with AES-256-GCM and cleared on revoke. Tokens and full IBANs must never be logged; UI uses masked IBANs. Provider failures are converted to safe errors and each sync is audited with status, timestamps and fetched/created/duplicate/updated counters. Consent statuses are `CONNECTED`, `REAUTH_REQUIRED`, `EXPIRED`, `REVOKED`, and `ERROR`.

## Idempotency and updates

The preferred identity is provider + provider account ID + provider transaction ID. If a provider cannot guarantee a stable ID, Nexus computes a deterministic SHA-256 fingerprint from normalized transaction fields. Repeated imports update the existing line for pending-to-booked, provider updates, reversals and deletions instead of creating another accounting event.

## Environment

- `OPEN_BANKING_PROVIDER`: provider adapter name. Use `mock` only in local/test environments.
- `OPEN_BANKING_ENCRYPTION_KEY`: exactly 32 random bytes encoded as Base64. Generate with `openssl rand -base64 32` and manage it through the deployment secret store.
- `AUTH_URL`: public Nexus base URL, used to build the OAuth callback URL.

Never commit these secrets. Key rotation requires a controlled token re-encryption procedure or fresh consent.

## Mock and sandbox

`MockOpenBankingProvider` simulates BNL discovery, consent, one EUR account, balances, booked and pending transactions, duplicates, pending-to-booked, expiry, revoke and safe provider errors. Set `OPEN_BANKING_PROVIDER=mock` only for local demonstrations; tests inject the mock explicitly and require a database whose name contains `_test`.

## Adding a provider or bank

1. Implement every method of `OpenBankingProvider` in `lib/open-banking/providers/`.
2. Normalize accounts, balances and transactions into the provider-independent DTOs.
3. Register the adapter in the provider factory and configure it through environment secrets.
4. Discover BNL or another bank via the provider API; persist its provider-specific institution ID, never a guessed or hardcoded PSD2 endpoint.
5. Add contract, consent, failure, idempotency and tenant/location tests before enabling it.

## What Nexus does not store

Nexus stores no bank username, password, PIN, OTP or payment authorization secret. V1 stores encrypted provider tokens, consent metadata, masked-display account metadata, read-only balances and normalized statement transactions needed by Treasury reconciliation. It does not initiate payments and does not bypass the Treasury ledger.
