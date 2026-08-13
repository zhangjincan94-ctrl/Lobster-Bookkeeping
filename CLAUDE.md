# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lobster Accounting (龙虾记账) — a WeChat Mini Program with a Koa API backend for small-business transaction accounting. Originally built for lobster vendors, it now supports a universal multi-product ledger model alongside the legacy lobster-specific workflow.

## Development Commands

```bash
# Server
cd server
npm install
npm run dev        # Start with nodemon (auto-restart)
npm start          # Run migration then start server
npm test           # Run all tests (node:test)
npm run migrate    # Run DB migration only (safe: creates missing tables, never drops data)
npm run sync       # Recreate all tables (requires ALLOW_DB_RESET=true; rejected in production)

# Mini Program
# Open miniprogram/ in WeChat DevTools — no build step needed.
# For local dev: set baseUrl in miniprogram/utils/config.js to http://localhost:3000
# and enable "不校验合法域名" in DevTools settings.
```

## Architecture

```
miniprogram/          WeChat Mini Program (native WXML/WXSS/JS)
  pages/book/         Universal ledger: bill create/list/detail/edit
  pages/customer/     Customer management, ledger view, customer selection
  pages/product/      Product library and category management
  pages/query/        Transaction search and filtering
  pages/share/        Public read-only share pages (statement, records)
  pages/transaction/  Legacy lobster sales (add/list/detail)
  pages/purchase/     Legacy lobster purchases (add/list/detail)
  pages/buyer/        Legacy buyer management
  pages/supplier/     Legacy supplier management
  pages/stats/        Analytics: overview, debt ranking, product analysis
  pages/login/        WeChat login
  pages/me/           Shop settings, product library, category management
  pages/index/        Home / dashboard
  utils/              request.js (HTTP client), config.js (API URLs), format.js, auth.js

server/               Koa API server (Node.js)
  src/
    app.js            Entry point: Koa setup, middleware, router
    config/           Environment config (dotenv) and Sequelize connection
    models/           Sequelize model definitions + associations (models/index.js)
    routes/           koa-router route definitions, auth middleware applied per-route
    controllers/      Thin: validate input, call service, format HTTP response
    services/         Business logic, DB transactions, validation
    serializers/      Shape API responses (flatten associations, rename fields)
    middlewares/      auth.js (JWT verification), errorHandler.js
    utils/            response.js (success/error/paginate helpers), pagination.js, wx.js
    migrate.js        Safe schema migration (CREATE TABLE IF NOT EXISTS + ALTER TABLE)
    sync.js           Destructive schema reset (requires ALLOW_DB_RESET=true)
```

## Two Coexisting Data Models

The codebase has **two parallel data models** that coexist:

1. **Legacy lobster-specific** (`transactions`, `purchase_records`, `buyers`, `suppliers`, `payment_records`, `supplier_payment_records`, `transaction_purchase_allocations`, `other_costs`) — tied to fixed lobster sizes and purchase-to-sale cost allocation.

2. **Universal ledger** (`customers`, `products`, `product_categories`, `ledger_bills`, `ledger_bill_items`, `customer_payments`, `customer_statements`) — multi-product, direction-based (`sale`/`purchase`), customer-centric with separate receivables and payables tracking.

Both share the same `merchants` table for tenant isolation. All business data is scoped by `merchant_id`.

## Key Patterns

### API Response Format
All responses use `{ code: 0, message, data }`. Paginated responses use `{ code: 0, message, data: { list, total, page, pageSize, totalPages } }`. The `success()`, `error()`, and `paginate()` helpers in `server/src/utils/response.js` enforce this.

### Naming Convention
- **Server**: Database columns use `snake_case` (Sequelize `underscored: true`). API JSON uses `snake_case`.
- **Mini Program**: `request.js` automatically converts outgoing data to `snake_case` and incoming data to `camelCase`. All client-side JS uses `camelCase`.

### Auth Flow
WeChat login (`wx.login`) → server validates with WeChat API → issues JWT. Auth middleware (`server/src/middlewares/auth.js`) extracts merchant from JWT and sets `ctx.state.merchant`. Share pages are public (no auth required).

### Database Migrations
`migrate.js` is the schema authority. It uses `CREATE TABLE IF NOT EXISTS` and safe `ALTER TABLE` (checking `INFORMATION_SCHEMA` before adding columns). Never drops or alters existing data. Run via `npm start` or `npm run migrate`. Sequelize `sync()` is also called first but only creates missing tables due to the raw SQL that follows.

### Controller Pattern
Controllers are thin: extract and validate params from `ctx`, call the service layer, format the response. Never put business logic in controllers.

### Transaction Safety
Services use `sequelize.transaction()` with row-level locking (`LOCK: 'UPDATE'`) for operations that read-then-write (payments, bill updates, purchase allocations). All validation happens inside the transaction.

### Soft Delete
The universal ledger uses soft delete: `deleted_at` columns on `ledger_bills`, `customers` (via `archived_at`), and `products` (via `archived_at`). Legacy models use `order_status = 1` / `cancelled_at` for cancellation.

### Test Approach
Tests use Node.js built-in `node:test` with `t.mock.method()` for mocking. Tests cover service-layer business logic, validation edge cases, and serializer output. Run with `npm test` from `server/`.

## Environment Variables

Copy `server/.env.example` to `server/.env`. Key variables:
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — MySQL/TiDB connection
- `DB_SSL_CA_BASE64` — Base64-encoded PEM CA cert for TiDB Cloud TLS (leave empty for local MySQL)
- `JWT_SECRET` — must be changed from `change_me` or server refuses to start
- `WX_APPID`, `WX_SECRET` — WeChat Mini Program credentials
- `CORS_ORIGIN` — optional CORS origin
- `ALLOW_DB_RESET` — must be `true` for `npm run sync` to work