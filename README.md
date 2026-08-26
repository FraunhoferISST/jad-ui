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
- **Keycloak SSO auth** — Authentication is implemented via OAuth 2.0 / OIDC
  (Authorization Code + PKCE) against Keycloak and still abstracted behind an
  `AuthProvider` interface.
- **Runtime config** — Menu, auth, and backend URLs are loaded from JSON at
  startup, so the same build can target different environments.
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
- **Participants** load their EDC connector config from Keycloak token claim
  `edc_connector_config`.
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

Open http://localhost:4200/. You'll land on `/login` and start SSO login via
Keycloak.

## Configuration

Runtime configuration lives in `public/config/` and is fetched at startup, so it
can be replaced per environment without rebuilding:

| File | Purpose |
| --- | --- |
| `app-config.json` | Menu items, health-check interval, view descriptions |
| `redline-config.json` | Redline backend base URL + DID prefix (operator) |
| `auth-config.json` | Keycloak issuer/client and OIDC redirect settings |

If `redline-config.json` is missing or invalid, JAD UI falls back to built-in
defaults (`http://localhost:8081`). See `src/operator-view/redline.config.ts`.

Currently, JADs only way to access the EDC components is with a jwtlet provisioned token, which relies on kubernetes service accounts and the kubernetes token API.
Therefore, we need `kubectl` and the jwtlet to generate tokens for the tenants/participants.

After deploying JAD, after deploying new participants, or when connector tokens
expire (1h TTL), run the sync script. It updates/creates Keycloak participant
users and refreshes the `edc_connector_config` claim:
```sh
./create-edc-connector-config.sh
```

The script uses `connectorName` (from participant DID) as both username and
password for each participant user in dev.

## Authentication & roles

Auth is abstracted behind `AuthProvider`. The shipped
`KeycloakAuthProvider` uses OAuth 2.0 / OpenID Connect with Keycloak.

Two realm roles are supported:

- **participant** — EDC views (catalog, assets, policies, contracts, transfers).
- **operator** — operator console (tenants, open registrations).

Both can access Home. Access is defined once in
`src/app/auth/access-rules.ts` and enforced by `roleGuard` and the menu filter.

Role-specific token claim requirements:

- **participant** must have `participant_context_id` claim.
- **participant** must have `edc_connector_config` claim.
- **operator** must have `operator_id` claim.

Missing required claims reject login during callback processing.

### Dev Keycloak on Kubernetes

Kubernetes manifests for local development are under `ops/keycloak/`.

1) Add local host mapping:

```text
127.0.0.1 keycloak.jad.localhost
```

2) Deploy Keycloak:

```bash
kubectl apply -k ops/keycloak/base
kubectl apply -k ops/keycloak/overlays/gateway
```

3) Verify:

```bash
kubectl -n jad-auth get pods
kubectl -n jad-auth get gateways.gateway.networking.k8s.io
kubectl -n jad-auth get httproutes.gateway.networking.k8s.io
```

If your cluster does not have Gateway API support, use the ingress overlay:

```bash
kubectl apply -k ops/keycloak/overlays/ingress
kubectl -n jad-auth get ingress
```

Keycloak will be available at `http://keycloak.jad.localhost` and the imported
realm issuer at `http://keycloak.jad.localhost/realms/jad-dev`.

The realm import config creates:

- realm `jad-dev`
- roles `operator` and `participant`
- client `jad-ui` (public, code flow, PKCE)
- protocol mappers for `participant_context_id`, `edc_connector_config`, and `operator_id`
- demo users `operator` and `participant` with role-specific attributes

_Note_: As long as there is no identity provider, the `operator` role can access all service providers and the `participant` role has access to all participants.

## Project structure

```
src/
├── app/
│   ├── app.config.ts        # bootstrap providers (router, http, auth, redline)
│   ├── app.routes.ts        # top-level + lazy-loaded shell child routes
│   ├── auth/                # AuthService, Keycloak provider, guards, access rules
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
