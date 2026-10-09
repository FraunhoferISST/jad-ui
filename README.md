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
- [Policy Builder](#policy-builder)
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
  dataspaces, tenants, and participant deployments via the Redline backend.
  All tenant operations use the seeded service provider with ID `1`; provider
  selection and creation are not supported.
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
    policy-builder / contracts          shared Home for all roles
    contract-definitions
    ──► EDC connectors
```

- The authenticated **shell** owns the router-outlet and renders navigation from
  `AppConfig.menuItems`, filtered by the current role.
- **Participants** load their EDC connector config from Keycloak token claim
  `edc_connector_config`.
- **Operators** see the Redline backend surfaced as a single connector with a
  custom health check; tenant operations go through `RedlineService`.
- **Redline service provider** is always the seeded provider with ID `1`, for
  public registration, operator actions, participant-context lookup and partner
  requests. Redline must seed this provider before use; there is no configurable
  provider ID or fallback to another provider.

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
| `participant-config.json` | Upload limits, file-sharing URL, and authenticated Siglet token-proxy URL |

If `redline-config.json` is missing or invalid, JAD UI falls back to built-in
defaults (`http://localhost:8081`). See `src/operator-view/redline.config.ts`.

Currently, JADs only way to access the EDC components is with a jwtlet provisioned token, which relies on kubernetes service accounts and the kubernetes token API.
Therefore, we need `kubectl` and the jwtlet to generate tokens for the tenants/participants.

## Remote file downloads

Owned files use the authenticated file-sharing API. Remote files in Explore use
`TransferService.requestTransferAndDownload`: initiate the Siglet HTTP-pull
profile, wait for `STARTED`, retrieve the transfer's `{ token, endpoint }` EDR
from Siglet, fetch the endpoint with the transfer token, and download the Blob
in the browser. This JAD deployment does not expose the EDC `/v3/edrs` API.

`participant-config.json`'s `siglet.baseUrl` must point at a CORS-enabled,
participant-scoped token proxy, not at a Siglet API expecting jwtlet tokens from
the browser. Uploaded assets now include the owner's `participantContextId`
and `fileId` in `dataplaneMetadata.properties`; Siglet must map both to the
same-named download-token claims. Old assets need metadata migration or re-upload.

See [download setup and verification](ops/transfer-download/README.md) for
Siglet configuration, proxy authentication, and the verified browser flow.
The checked-in `/proxy/issuerservice` URL is a **local compatibility mapping**
to Siglet, not the normal issuer-service route; use a dedicated Siglet proxy in
shared deployments. Keep `/proxy/default` on the control-plane health API.

## Policy Builder

Tenant admins have a **Policy Builder** view at `/policy-builder`, alongside the
existing Policy Definitions view. It follows the Tractus-X dashboard's
constraint-sidebar / constraint-editor / preview workflow, implemented with this
application's Angular and daisyUI components rather than its hard-coded Catena-X
building-block catalog.

The builder fetches `config/jad-profile.json`. Its single source is
`ops/jad-profile-seed/jad-profile.json`, used directly by the seed Kustomization.
Angular's build and test asset configuration publishes only that JSON at the
existing URL; Kubernetes manifests remain outside the web assets.
At deployment the served JSON can be replaced like other runtime configuration;
reload the view to load changes. Keep it aligned with the control-plane schema
cache by rerunning the profile seed when changing the schema.

- There is no access/usage policy-type selector or purpose metadata. Policies use
  the schema-supported ODRL action; their access/usage role is determined by a
  contract definition's `accessPolicyId` / `contractPolicyId` references.
- Each Permission, Obligation and Prohibition category has a single rule draft.
  Its **+** button opens an inline constraint dropdown, not an add-rule menu.
  Category submenus list constraints with compact summaries and a single
  truncated description line. Adding a constraint selects it automatically.
- The center pane edits the selected constraint directly, showing its full
  schema description, operator/value controls and validation feedback. Changes
  immediately update the JSON-LD preview; there is no modal Save/Cancel step.
- Generated rule arrays contain at most one item per category. The base
  permission is retained when empty; obligation and prohibition are omitted
  until configured, avoiding an accidental unconditional prohibition.
- The workspace fills the shell's available content height instead of growing
  with the policy. Navigation, constraint editing and JSON-LD have independent
  scroll areas. On narrow screens the same bounded panes stack vertically.
- Permission, prohibition and obligation palettes are derived from reachable
  JSON Schema definitions and local `$ref` / `allOf` / `oneOf` / `anyOf` links.
- Operand titles, descriptions, operator choices, constants, value formats and
  conditional scalar/list controls come from the schema. For example,
  `CounterPartyId` switches to a one-value-per-line list for `isAnyOf`, while
  `inForceDate` appears only on permissions, not prohibitions or obligations.
- Nested logical groups can be edited recursively in the center pane. This
  constraint-focused view authors the three top-level rule categories; it does
  not currently expose separate permission-attached duty authoring.
- The live creation-request preview is validated with draft-2019-09 JSON Schema
  and date-time format checking. Invalid/incomplete drafts cannot be submitted.
- **Policy name / ID** supplies the policy definition's `@id`. **Create policy**
  sends the exact compact request to the currently selected participant's EDC
  management endpoint, without the redundant plain `id` property. Server
  validation and duplicate-ID errors are displayed; no credentials or CEL
  evaluators are registered by the builder.

The schema must be self-contained and expose a PolicyDefinition envelope with
finite operand choices and scalar/list value schemas. Enumerated operators are
used directly; pattern-only operator schemas filter the standard ODRL vocabulary.
This is an ODRL authoring builder, not a general-purpose editor for every JSON
Schema keyword. An unconstrained rule or policy is supported and clearly shown.
Schema metadata cannot install new runtime evaluators: new operands still need
matching EDC functions/CEL registrations.

No new Keycloak role or mapper is required: the existing `tenant-admin` role
controls both navigation and route access. The schema is a static authoring
asset, so the view does not need the platform-admin-only cached-document API.

## Deploy Kubernetes dev services

The three deployable components under `ops/` — Keycloak, `keycloakagent` and
`jad-profile-seed` — share one Kustomize entry point. After the platform's
jwtlet/issuer seeds have completed, deploy all three from the repository root:

```bash
kubectl apply -k ops/
```

The `edc-v` namespace and platform services/service accounts (`seed-jobs` and
`cfm-agents`) must already exist. Keycloak requires Gateway API CRDs and a
controller with GatewayClass `traefik`; only gateway mode is supported.
For the seed's API and permission requirements, see
[its prerequisites](ops/jad-profile-seed/README.md#prerequisites).
Each component can also be applied separately with `kubectl apply -k ops/<component>/`.

## JAD policy profile seed

`ops/jad-profile-seed/jad-profile.json` defines the JAD policy authoring schema.
[`ops/jad-profile-seed/`](ops/jad-profile-seed/README.md) provides a temporary
standalone Kubernetes Job to cache that schema, register its validator for all
policy-definition creation requests, and register the membership, manufacturer and
counterparty CEL expressions. It will move to the JAD dataspace-profile Helm
chart later.

The unified `kubectl apply -k ops/` deployment includes this Job and generates
its schema ConfigMap directly from the same JSON file used by the UI. Follow
its progress with:

```bash
kubectl -n edc-v logs -f job/jad-profile-seed
```

The Job requires the platform's existing `seed-jobs` service account and a
control-plane image with the document-cache, CEL and schema-validation APIs.
It uses jwtlet's `admin` scope, not a UI role. Reruns update managed registrations;
the schema applies even when `policy.profile` is omitted. Applying an existing
Job does not rerun it: delete the completed Job first or wait for its one-hour
TTL cleanup, then reapply. See the seed README for rerun commands, prerequisites,
configuration and local tests.

## Authentication & roles

Auth is abstracted behind `AuthProvider`. The shipped
`KeycloakAuthProvider` uses OAuth 2.0 / OpenID Connect with Keycloak.

Three realm roles are supported:

- **tenant-admin** — Partners, Policy Builder and EDC views (catalog, assets, policies, contract definitions, contracts, transfers).
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

2) Deploy all dev services (or only Keycloak with `kubectl apply -k ops/keycloak/`):

```bash
kubectl apply -k ops/
```

3) Verify:

```bash
kubectl -n edc-v get pods
kubectl -n edc-v get gateways.gateway.networking.k8s.io
kubectl -n edc-v get httproutes.gateway.networking.k8s.io
```

Gateway API support and GatewayClass `traefik` are required; there is no ingress
overlay. If migrating from the old ingress deployment, delete its existing
Ingress (`kubectl -n edc-v delete ingress keycloak --ignore-not-found`) because
`kubectl apply` does not remove resources omitted from the manifests.

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
UI API for tenants and participants under the seeded service provider with ID
`1` (`/api/ui/service-providers/1/tenants`), resolves each participant's
`did:web` document to derive its DSP protocol URL and participant
context id, upserts the jwtlet mapping for the EDC proxy service account,
registers each participant's Siglet HTTP-pull dataplane with the control plane,
and creates/updates both Keycloak users with the same `edc_connector_config`
claim. The existing username receives `tenant-user`; `<username>-admin` receives
`tenant-admin`. Old `participant` role mappings are removed from synced users. Only create/update is performed — users no
longer present in Redline are never removed.

The unified `kubectl apply -k ops/` deployment includes the agent (see
`ops/keycloakagent/`). When updating its code or configuration, reapply and
restart it:

```bash
kubectl apply -k ops/
# The ConfigMap has a stable name; restart after agent.py-only changes too.
kubectl -n edc-v rollout restart deployment/keycloakagent
kubectl -n edc-v rollout status deployment/keycloakagent
```

Dataplane registration uses the agent's projected Kubernetes service-account
token exchanged at jwtlet for `resource=<participant context id>` and
`scope=management-api:admin`. The `cfm-agents` identity must already have that
participant-scoped permission; the agent does not broaden its own mapping.
Every poll repeats `PUT /v5/participants/{id}/dataplanes` with the stable ID
`siglet-{id}`, the Siglet HTTP-pull profile, and `signaling` token-exchange
authorization. Registration failures are logged and retried on the next poll
without blocking Keycloak user updates. No machine token is put in user claims.

Cluster-internal registration endpoints are configurable in
`ops/keycloakagent/deployment.yaml`:

- `CONTROLPLANE_MANAGEMENT_URL` — management base, including `/api/mgmt`.
- `SIGLET_SIGNALING_URL` — Siglet signaling base (port 8081).
- `JWTLET_TOKEN_EXCHANGE_URL` — jwtlet token-exchange base (port 8080; the agent appends `/token`).
- `JWTLET_AUDIENCE` — exchanged token audience (default `edcv`).

See [remote download setup and browser verification](ops/transfer-download/README.md).
Run agent tests with `python -m unittest discover -s ops/keycloakagent -v`
(requires `requests` and `kubectl` for the rendered ConfigMap check).

The agent uses the path of the DID `did:web:identity.jad.localhost:<path>` as both username
and password for the tenant-user in dev. The admin login is `<path>-admin` with password `admin`.

Both logins currently use the same EDC proxy service-account jwtlet mapping.
The deployment explicitly sets `JWTLET_SCOPES` to retain the existing management
scopes and add `siglet-token` for participant-bound transfer-token retrieval. Restricting EDC scopes per login requires separate proxy/token identities;
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
├── participant-view/
│   ├── policy-builder/      # schema-driven ODRL builder and validation
│   ├── edc-controllers/     # custom management API controllers
│   └── files/ explore/ partners/ services/ models/ utils/
├── operator-view/
│   ├── redline.config.ts    # REDLINE_CONFIG token + APP_INITIALIZER loader
│   ├── services/            # RedlineService (tenants, dataspaces, deploy)
│   ├── models/ util/ validators/
│   └── tenant-view/         # tenants & open-registrations UI
└── styles.css               # Tailwind + daisyUI themes
public/config/               # runtime JSON config
ops/jad-profile-seed/jad-profile.json # shared schema; served at config/jad-profile.json
ops/kustomization.yaml       # deploy all three dev components with kubectl apply -k ops/
ops/keycloak/                 # flat Gateway API-only Keycloak deployment
ops/keycloakagent/            # Redline participant identity sync
ops/jad-profile-seed/         # temporary schema + CEL registration Job
```
