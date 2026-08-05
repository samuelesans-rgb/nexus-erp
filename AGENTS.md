<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Nexus ERP — Agent Quick Reference

## Stack & Key Versions
- **Next.js 16** (App Router) + **React 19**
- **TypeScript** (strict) + **Tailwind CSS 4**
- **Auth.js v5** (beta) with Prisma adapter, JWT sessions
- **Prisma ORM 7** + **PostgreSQL** (driver adapter: `@prisma/adapter-pg`)
- Prisma Client generated to `../generated/prisma` (custom output path)

## Project Identity
Nexus ERP is a commercial multi-tenant ERP platform.
**Vertical priority order**: 1. Restaurant, 2. Beauty, 3. Hotel.
Architecture must remain shared. Verticals must never duplicate logic already in Core Engines.

## Core Engines
Auth, Membership, Modules, Partners, Configuration, Items, Inventory, Documents, Sales, Purchasing, Treasury.
All new development must reuse them. Business logic stays in `lib/` services. Pages must be thin. Server Actions orchestrate, not implement logic.

## Architectural Rules
- **No Partner duplication** — single source of truth
- **No Item duplication** — single source of truth
- **Inventory** is the only source of truth for stock
- **Treasury** never updates Inventory directly
- **Documents** never update StockBalance directly
- **Sales/Purchasing** always use Document Engine
- **Restaurant/Beauty/Hotel** are orchestrators of Core Engines
- Every critical operation must be: **transaction-safe**, **tenant-safe**, **idempotent**

## Architecture Essentials
- **Multi-tenant**: Every data access scoped by `companyId` from session (`token.companyId`)
- **Membership + Roles**: Users belong to companies via `Membership`; roles control permissions
- **Module system**: `CompanyModule` enables/disables features per company (Restaurant, Hotel, Beauty, etc.)
- **Tenant isolation is mandatory**: UI guards ≠ server checks; always filter by `companyId`
- **Idempotency**: Critical mutations use `IdempotencyRecord` (key = `companyId:commandType:idempotencyKey`)

## Directory Structure
```
app/
  (auth)/login         # Auth pages
  (dashboard)/         # Protected app routes per vertical
    dashboard/         # Main dashboard
    documents/         # Business documents (invoices, orders, etc.)
    inventory/         # Stock, movements, transfers, counts
    items/             # Products, services, recipes, ingredients
    partners/          # Customers, suppliers
    purchases/         # Purchase orders, receipts
    restaurant/        # Tables, reservations, orders, kitchen
    sales/             # Quotes, sales orders, delivery notes
    settings/          # Company, modules, users
    treasury/          # Accounts, movements, reconciliation
  api/auth/            # NextAuth route handlers
lib/
  prisma.ts            # PrismaClient singleton with pg adapter
  *.ts                 # Domain services (inventory, documents, restaurant, treasury, sales, purchasing, items, partners, modules, idempotency, etc.)
  *-access.ts          # Server-side authorization helpers
  *-routing.ts         # Document workflow routing rules
tests/
  integration/         # node:test (requires DATABASE_URL with _test suffix)
  e2e/                 # Playwright (requires dev server on :3100, _test DB)
  stubs/               # Test utilities
```

## Developer Commands
```bash
npm run dev              # Start dev server (port 3000)
npm run build            # Production build
npm run start            # Run production build
npm run lint             # ESLint (next/core-web-vitals + next/typescript)
npm run test:integration:core  # Integration tests (node:test)
npm run test:e2e         # Playwright E2E
npm run test:e2e:ui      # Playwright UI mode

npx prisma generate      # Generate client (output: ../generated/prisma)
npx prisma migrate dev   # Apply/create migrations in dev
npx prisma studio        # Local DB UI
npx prisma db seed       # Seed database (tsx prisma/seed.ts)
```

## Development Workflow (mandatory order)
1. Analisi
2. Implementazione
3. Prisma format
4. Prisma validate
5. Prisma generate
6. TypeScript
7. ESLint
8. Build
9. Integration Test
10. Playwright E2E
11. git diff --check
12. Stage only required files
13. Commit only when all checks pass
14. No automatic push

## Critical Conventions
1. **Prisma Client import**: `import { PrismaClient } from "../generated/prisma/client"`
2. **Database URL**: Must use `postgresql://...` format; tests require `_test` suffix (e.g., `nexus_erp_test`)
3. **Session data**: `session.user` includes `companyId`, `membershipId`, `roles[]` — use for tenant scoping
4. **Server actions / API routes**: Always validate `companyId` from session, never trust client input
5. **Idempotency keys**: Pass from client for mutations that must not duplicate (inventory batch, recipe serve, order close)
6. **Decimal handling**: Prisma returns `Decimal` (from `decimal.js`); use `.toNumber()` or `.toFixed()` for UI
7. **Soft deletes**: Many models have `deletedAt` — filter `deletedAt: null` for active records
8. **Enums**: Defined in Prisma schema; import from `@prisma/client` (e.g., `ItemType`, `DocumentStatus`)

## Testing Requirements
- **Integration & E2E tests**: Must use exclusively databases with `_test` suffix — never dev or prod DB
- **Integration tests**: `DATABASE_URL` must contain `_test` (enforced in test file)
- **E2E tests**: Requires running dev server (`npm run dev -- -p 3100`) + `_test` database
- Playwright config auto-switches `DATABASE_URL` to `_test` variant
- Tests clean up their own data; run sequentially (`workers: 1`)

## Git Policy
Never use: `git add .`
Never create commits without explicit request.
Never push without request.
Never use without explicit authorization:
- `git reset --hard`
- `git clean -fd`
- `prisma migrate reset`
- `prisma db push --force-reset`
Never modify: `generated/`, `.next/`
Never modify package version unless requested.

## Repository Cleanliness
Never commit:
- `generated/`, `.next/`, `node_modules/`
- `playwright-report/`, `test-results/`, `blob-report/`, `trace/`, `video/`, `screenshots/`
- `*.pcap`
- `.env*`
- Local databases

## Environment Variables (`.env` — not committed)
```
DATABASE_URL="postgresql://user:pass@host:port/db?schema=public"
AUTH_SECRET="..."        # Generate with: openssl rand -base64 32
AUTH_URL="http://localhost:3000"
```

## Key Documentation (in `docs/`)
- `ARCHITECTURE.md` — System design, module boundaries, data flow
- `DECISIONS.md` — ADRs (e.g., why driver adapter, idempotency pattern)
- `FUNCTIONAL_REQUIREMENTS.md` — Business requirements per vertical
- `MODULE_CATALOG.md` / `MODULE_DEPENDENCIES.md` — Module definitions & deps
- `ROADMAP.md` — Planned work order
- `database/schema.dbml` — Visual DB schema reference

## Common Gotchas
- **No `middleware.ts`** — auth guards live in layout/components and server utils
- **Prisma generate output** is non-standard (`../generated/prisma`) — update imports if moving files
- **Next.js 16** has breaking changes vs 15 — check `node_modules/next/dist/docs/` for migration notes
- **Auth.js v5 beta** — APIs may change; check `auth.config.ts` for current callback shapes
- **Tailwind 4** uses `@import "tailwindcss"` in CSS, not `@tailwind` directives