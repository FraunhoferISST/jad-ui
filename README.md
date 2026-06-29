# JAD UI

A role-aware dashboard for **Eclipse Dataspace Components (EDC)** dataspaces. JAD UI
uses the [`@eclipse-edc/DataDashboard`](https://github.com/eclipse-edc/DataDashboard)
library shell for participant workflows (catalog, assets, policies, contracts,
transfers) and adds custom **operator views** for tenant onboarding and
deployment, backed by the Redline tenant-management API.

> Built with Angular 21, Tailwind CSS 4, and daisyUI. Standalone components,
> lazy-loaded routes, and a swappable authentication provider.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Authentication & roles](#authentication--roles)
- [Project structure](#project-structure)

## Features

- **EDC participant views** — Home, Catalog, Assets, Policy Definitions,
  Contract Definitions, Contracts, and Transfer History, all provided by the
  `@eclipse-edc/dashboard-core` library and lazy-loaded per route.
- **Operator console** — Tenants and Open Registrations views for managing
  service providers, dataspaces, tenants, and participant deployments via the
  Redline backend.
- **Role-based access** — A single source of truth (`ACCESS_RULES`) drives both
  route guards and menu filtering, so navigation and authorization never drift.
- **Swappable auth** — Authentication is hidden behind an `AuthProvider`
  interface. The default credentials provider can be replaced with OAuth/OIDC in
  a single binding change.
- **Runtime config** — Connectors, menu, and backend URLs are loaded from JSON
  at startup, so the same build can target different environments.
- **Multi-theme UI** — Tailwind 4 + daisyUI with a theme switcher.

## Architecture

```
                  ┌──────────────────────────────────────┐
                  │            App root (App)            │
                  │            top-level router          │
                  └──────────────────────────────────────┘
                    │            │                 │
            /login  │   /register│            ''   │ (authGuard)
                    ▼            ▼                 ▼
              Login view   Registration     ShellComponent  ──► <lib-dashboard-app>
                                            (role-filtered menu, themes, user menu)
                                                  │
              ┌───────────────────────────────────┼──────────────────────────────┐
              ▼                                   ▼                              ▼
   participant views (library)         operator views (local)            shared: Home
   catalog / assets / policies /     tenants / open-registrations
   contract-definitions /            ──► RedlineService ──► Redline API
   contracts / transfer-history
   ──► EDC connectors
```

- The authenticated **shell** owns the router-outlet and renders navigation from
  `AppConfig.menuItems`, filtered by the current role.
- **Participants** talk to EDC connectors (`edc-connector-config.json`).
- **Operators** see the Redline backend surfaced as a single connector with a
  custom health check; tenant operations go through `RedlineService`.

## Prerequisites

- **Node.js** 20.19+ or 22.12+ (this repo is tested on Node 26).
- **npm** 10+.
- Access to the **GitHub Packages** registry for `@eclipse-edc` scope. The
  `.npmrc` already points the scope at `https://npm.pkg.github.com/`; you need a
  personal access token with `read:packages` available to npm:

  ```bash
  npm login --scope=@eclipse-edc --registry=https://npm.pkg.github.com
  ```

## Getting started

```bash
# install dependencies (requires GitHub Packages auth, see above)
npm install

# start the dev server with HMR
npm start
```

Open http://localhost:4200/. You'll land on `/login` — sign in with the demo
credentials below.

## Configuration

Runtime configuration lives in `public/config/` and is fetched at startup, so it
can be replaced per environment without rebuilding:

| File | Purpose |
| --- | --- |
| `app-config.json` | Menu items, health-check interval, view descriptions |
| `edc-connector-config.json` | EDC connectors participants connect to |
| `redline-config.json` | Redline backend base URL + DID prefix (operator) |

If `redline-config.json` is missing or invalid, JAD UI falls back to built-in
defaults (`http://localhost:8081`). See `src/operator-view/redline.config.ts`.

## Authentication & roles

Auth is abstracted behind `AuthProvider`. The shipped `CredentialsAuthProvider`
validates against an in-memory user list — no backend required.

| Username | Password | Role |
| --- | --- | --- |
| `operator` | `operator` | operator |
| `participant` | `participant` | participant |

Two roles are supported:

- **participant** — EDC views (catalog, assets, policies, contracts, transfers).
- **operator** — operator console (tenants, open registrations).

Both can access Home. Access is defined once in
`src/app/auth/access-rules.ts` and enforced by `roleGuard` and the menu filter.

**Switching to OAuth/OIDC:** implement `AuthProvider` and change the binding in
`src/app/auth/auth.config.ts` (`provideAuth()`). No other code needs to change.

## Project structure

```
src/
├── app/
│   ├── app.config.ts        # bootstrap providers (router, http, auth, redline)
│   ├── app.routes.ts        # top-level + lazy-loaded shell child routes
│   ├── auth/                # AuthService, providers, guards, access rules
│   ├── login/               # login view
│   ├── registration/        # public tenant-registration form
│   └── shell/               # dashboard shell wrapper + user menu
├── operator-view/
│   ├── redline.config.ts    # REDLINE_CONFIG token + APP_INITIALIZER loader
│   ├── services/            # RedlineService (tenants, dataspaces, deploy)
│   ├── models/ util/ validators/
│   └── tenant-view/         # tenants & open-registrations UI
└── styles.css               # Tailwind + daisyUI themes
public/config/               # runtime JSON config
```

