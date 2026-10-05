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
- [JAD policy profile seed](#jad-policy-profile-seed)
- [Authentication & roles](#authentication--roles)
- [Project structure](#project-structure)

## Features

- **EDC participant views** — Home, Catalog, Assets, Policy Definitions,
  Contract Definitions, Contracts, and Transfer History, all provided by the
  `@eclipse-edc/dashboard-core` library and lazy-loaded per route for tenant admins.
- **Tenant-user views** — Files (including uploads under an admin-created contract
  definition) and Explore.
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
    tenant-admin (EDC + Partners)       tenant-user (Files, Explore)      operator (Tenants)
    catalog / assets / policies /       ──► file sharing + EDC           ──► Redline API
    contract-definitions / contracts    shared Home for all roles
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

## JAD policy profile seed

The root `jad-profile.json` defines the JAD policy authoring schema.
[`ops/jad-profile-seed/`](ops/jad-profile-seed/README.md) provides a temporary
standalone Kubernetes Job to cache that schema, register its validator for all
policy-definition creation requests, and register the membership, manufacturer and
counterparty CEL expressions. It will move to the JAD dataspace-profile Helm
chart later.

After the platform's jwtlet/issuer seeds have completed:

```bash
bash ops/jad-profile-seed/deploy.sh
kubectl -n edc-v logs -f job/jad-profile-seed
```

The Job requires the platform's existing `seed-jobs` service account and a
control-plane image with the document-cache, CEL and schema-validation APIs.
It uses jwtlet's `admin` scope, not a UI role. Reruns update managed registrations;
the schema applies even when `policy.profile` is omitted.
See the seed README for prerequisites, configuration and local tests.

## Authentication & roles

Auth is abstracted behind `AuthProvider`. The shipped
`KeycloakAuthProvider` uses OAuth 2.0 / OpenID Connect with Keycloak.

Three realm roles are supported:

- **tenant-admin** — Partners and EDC views (catalog, assets, policies, contract definitions, contracts, transfers).
- **tenant-user** — Files and Explore. Uploads reuse an existing contract definition and its policies; the tenant admin creates the definition.
- **operator** — operator console (tenants, open registrations).

All can access Home. Access is defined once in
`src/app/auth/access-rules.ts` and enforced by `roleGuard` and the menu filter.

Role-specific token claim requirements:

- **tenant-admin** and **tenant-user** must have `participant_context_id` and `edc_connector_config` claims.
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
kubectl apply -k ops/keycloak/overlays/gateway
```

3) Verify:

```bash
kubectl -n edc-v get pods
kubectl -n edc-v get gateways.gateway.networking.k8s.io
kubectl -n edc-v get httproutes.gateway.networking.k8s.io
```

If your cluster does not have Gateway API support, use the ingress overlay:

```bash
kubectl apply -k ops/keycloak/overlays/ingress
kubectl -n edc-v get ingress
```

Keycloak will be available at `http://keycloak.jad.localhost` and the imported
realm issuer at `http://keycloak.jad.localhost/realms/jad-dev`.

The realm import config creates:

- realm `jad-dev`
- roles `operator`, `tenant-admin` and `tenant-user`
- client `jad-ui` (public, code flow, PKCE)
- protocol mappers for `participant_context_id`, `edc_connector_config`, and `operator_id`
- demo users `operator`, `participant` (tenant-user) and `participant-admin` (tenant-admin) with role-specific attributes

### Sync Redline participants with Keycloak
A background agent (`keycloakagent`) keeps participant identities in sync
automatically. It runs in the cluster and, every 60 seconds, polls the Redline
UI API (`service-providers` → `tenants` → `participants`), resolves each
participant's `did:web` document to derive its DSP protocol URL and participant
context id, upserts the jwtlet mapping for the EDC proxy service account, and
creates/updates both Keycloak users with the same `edc_connector_config`
claim. The existing username receives `tenant-user`; `<username>-admin` receives
`tenant-admin`. Old `participant` role mappings are removed from synced users. Only create/update is performed — users no
longer present in Redline are never removed.

Deploy it alongside JAD (see `ops/keycloakagent/`):

```bash
kubectl apply -k ops/keycloakagent
```

The agent uses the path of the DID `did:web:identity.jad.localhost:<path>` as both username
and password for the tenant-user in dev. The admin login is `<path>-admin` with password `admin`.

Both logins currently use the same EDC proxy service-account jwtlet mapping, which retains
its existing scopes. Restricting EDC scopes per login requires separate proxy/token identities;
the UI role split alone does not enforce backend least privilege.

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
jad-profile.json             # JAD ODRL policy authoring schema
ops/jad-profile-seed/         # temporary schema + CEL registration Job
```
