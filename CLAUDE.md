# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**ABT Streaming — Sistema de Gestión de Cuentas**
Web platform for managing streaming service accounts (Netflix, Disney+, HBO Max, Prime Video, Crunchyroll), customer profiles, subscriptions, payments, and automated WhatsApp payment notifications.
Production: https://www.abtstreaming.site

## Commands

```bash
# Development — starts Vite (port 3000), Express API (port 3002), and WhatsApp server (port 3001) concurrently
npm run dev

# Run only specific services
npm run dev:ui      # Vite frontend only
npm run dev:app     # Express API only (port 3002)
npm run dev:wa      # WhatsApp server only

# Production build
npm run build       # Vite → dist/

# Lint
npm run lint

# Docker (production)
npm run docker:build
npm run docker:up
npm run docker:down
npm run docker:logs
```

There are no automated tests.

## Architecture

### Split Backend

Two separate Express servers run in separate Docker containers:

- **`server/index.js`** (port 3000/3002) — Main API + serves React build
- **`server/wa.js`** (port 3001, internal only) — WhatsApp client via Puppeteer

In `server/index.js`, all `/api/wa/*` requests are proxied internally to the WA container. In dev, Vite proxies `/api` → `localhost:3002`.

### Frontend: Tab-Based SPA

`src/App.jsx` controls navigation with a `activeTab` state string — there is **no URL-based router** (no React Router). Each tab renders a component directly. Global state lives in `src/context/AppContext.jsx`, which holds all entities (accounts, clients, suppliers, transactions, users) and exposes a centralized `api()` helper that attaches the JWT token and auto-logouts on 401.

### Backend: Route Structure

All data endpoints are in `server/routes/data.js`, protected by `authMiddleware` from `server/auth.js`. Key relationships:

- An **account** has many **profiles**
- A **profile** is assigned to a **client** (client data embedded in profile row)
- Assigning/renewing a profile automatically creates an **income transaction**
- Creating an account automatically creates an **expense transaction**
- Every mutation is logged to **audit_log**

### Database

SQLite via `better-sqlite3` (synchronous API). All operations go through `server/db.js`, which exports individual named functions (e.g., `getAccounts()`, `createProfile()`). The DB file lives at `server/data/streammanager.db` (gitignored, persisted via Docker volume).

### Security Model

- **Auth:** JWT (24h expiry). Issued at `/api/auth/login`, verified via middleware on every protected route.
- **Roles:** `admin` (all access) or `user` (restricted to allowed platforms, stored as JSON array in `users.permissions`).
- **Encryption:** Account passwords are stored encrypted. `server/crypto-utils.js` implements AES-256-GCM; ciphertext format is `enc:{iv}:{authTag}:{ciphertext}` (all hex). The key comes from `ENCRYPTION_KEY` env var (64-char hex = 32 bytes).

### WhatsApp Integration

`server/wa.js` manages a `whatsapp-web.js` client with LocalAuth session persistence (`.wwebjs_auth/`). Status and QR codes are pushed to connected browsers via **Server-Sent Events** (SSE). The frontend hook `src/hooks/useWAEvents.js` subscribes to `/api/wa/events` using a short-lived SSE token (5 min, from `/api/auth/sse-token`) to avoid exposing the main JWT in the EventSource URL.

### Styling

Tailwind CSS 4 (configured via `@tailwindcss/vite` — no `tailwind.config.js` file). Dark theme with slate-900 backgrounds and green accents. Framer Motion for animations. Lucide React for icons.

## Environment Variables

Copy `.env.example` → `.env` in the repo root before running locally.

| Variable | Description |
|---|---|
| `JWT_SECRET` | Long random string for JWT signing |
| `ENCRYPTION_KEY` | Exactly 64 hex chars (32 bytes) for AES-256-GCM |

In Docker, these are passed via `docker-compose.yml`. The WA container also receives `WA_HOST` and `WA_PORT` to know where the main app is.

## Docker Architecture

Two containers share a `stream-net` bridge network:

- **`app`** — Node 20 slim, builds frontend with Vite then serves via Express. Uses `server/package-app.json` (no Puppeteer).
- **`wa`** — Node 20 slim + full Chrome deps, runs WhatsApp client. Uses `server/package-wa.json`. Has `shm_size: 1gb` for Chromium stability.

The database and WA session are mounted as named volumes (`db_data`, `wa_session`) so they survive container restarts.
