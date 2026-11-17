# JAD UI

JAD UI (`jad-ui`) is a standalone, role-aware dashboard for **Eclipse Dataspace
Components (EDC)** dataspaces. It uses `@eclipse-edc/dashboard-core` from
[EDC DataDashboard](https://github.com/eclipse-edc/DataDashboard) for the application
shell and EDC workflows, with custom participant and operator views backed by the
Redline tenant-management API.

> Built with Angular 21, Tailwind CSS 4, and daisyUI. Standalone components,
> lazy-loaded routes, and Keycloak authentication.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Build and test](#build-and-test)
- [Container image](#container-image)
- [Configuration](#configuration)
- [Remote file downloads](#remote-file-downloads)
- [Tenant dataspace membership](#tenant-dataspace-membership)
- [Partner references](#partner-references)
- [Policy Builder](#policy-builder)
- [Deploy Kubernetes dev services](#deploy-kubernetes-dev-services)
- [JAD policy profile seed](#jad-policy-profile-seed)
- [Authentication & roles](#authentication--roles)
- [Project structure](#project-structure)

## Features

- **EDC participant views** — Home, Catalog, Assets, Policy Definitions,
  Contract Definitions, Contracts, and Transfer History, all provided by the
  `@eclipse-edc/dashboard-core` library and lazy-loaded per route for tenant admins.
- **Tenant-admin dataspace view** — Join dataspaces, edit membership metadata, and
  leave dataspaces for the logged-in admin's tenant via Redline. Registration
  creates tenants without assigning dataspace membership.
- **Tenant-admin partners view** — Partner references are stored per dataspace
  membership of the logged-in participant. Add registered participants or an
  arbitrary partner identifier (DID) with optional properties to a selected
  dataspace; the view lists the stored partners grouped by dataspace.
- **Tenant-user views** — Files (including uploads under an admin-created contract
  definition) and Explore. Owned-file sharing previews use the linked definition's
  policies, not stored partner lists; EDC remains responsible for policy enforcement.
  Agreements and transfer history are matched by asset and contract IDs, independent
  of the current sharing preview.
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
    tenant-admin (EDC + custom)         tenant-user (Files, Explore)      operator (Tenants)
    dataspaces / partners / catalog      ──► file sharing + EDC           ──► Redline API
    assets / policies / policy-builder   shared Home for all roles
    contracts / contract-definitions
    ──► EDC connectors + Redline
```

- The authenticated **shell** owns the router-outlet and renders navigation from
  `AppConfig.menuItems`, filtered by the current role.
- **Participants** load their EDC connector config from Keycloak token claim
  `edc_connector_config`.
- **Operators** see the Redline backend surfaced as a single connector with a
  custom health check; tenant operations go through `RedlineService`.
- **Redline service provider** is always the seeded provider with ID `1`, for
  public registration, operator actions, participant-context lookup, dataspace
  membership and partner requests. Redline must seed this provider before use;
  there is no configurable provider ID or fallback to another provider. The shared
  client and models live in `src/app/redline/`. Partner references belong to a
  dataspace membership, so partner operations are always scoped to a dataspace
  the authenticated participant has joined.

## Prerequisites

- **Node.js 24 LTS** recommended.
- **npm** 10+.
- **Docker with BuildKit** to build container images locally (optional).
- Access to the **GitHub Packages** registry for `@eclipse-edc` scope. The
  `.npmrc` already points the scope at `https://npm.pkg.github.com/`; you need a
  personal access token with `read:packages` available to npm:

  ```bash
  npm login --scope=@eclipse-edc --registry=https://npm.pkg.github.com
  ```

## Getting started

```bash
# Install the locked dependencies (requires GitHub Packages auth, see above).
npm ci

# Start the development server with HMR.
npm start
```

Open http://localhost:4200/. Sign-in requires Keycloak and the backing services;
see [Kubernetes dev services](#deploy-kubernetes-dev-services) and
[Authentication & roles](#authentication--roles) for the local setup.

## Build and test

| Command | Purpose |
| --- | --- |
| `npm start` | Run the development server on port 4200. |
| `npm run build` | Build the production application with bundle budget checks. |
| `npm run watch` | Rebuild the development application when files change. |
| `npm test` | Run the Karma/Jasmine suite in watch mode; requires Chrome. |

The Angular project and npm package are both named **`jad-ui`**. Production browser
assets are written to **`dist/jad-ui/browser/`**, the directory served by the
container image. The Dockerfile installs dependencies and builds these assets
from source; no local production build is required before `docker build`.

For a single headless test run:

```bash
npm test -- --watch=false --browsers=ChromeHeadless
```

Set `CHROME_BIN` to your browser executable if using Chromium instead of Chrome.

## Container image

Pull and run the latest image built from `main`, replacing `<owner>/<repository>`
with the lowercase GitHub repository name (for example, `eclipse-dataspace-hub/jad-ui`):

```bash
docker pull ghcr.io/<owner>/<repository>:latest
docker run --rm -p 4200:8080 ghcr.io/<owner>/<repository>:latest
```

Open http://localhost:4200/. The `latest` tag moves with new builds; to pin a
specific build, use `:sha-<full-commit-sha>` or the image digest instead.

The image listens on port **8080**. Mount replacement runtime JSON files under
`/usr/share/nginx/html/config/` to configure the deployment, including Keycloak
redirect URLs (see [Configuration](#configuration)).

To build the image locally, pass your authenticated npm configuration as a
BuildKit secret; no separate npm install or build is needed:

```bash
docker build --secret id=npmrc,src="$HOME/.npmrc" --tag jad-ui:local .
docker run --rm -p 4200:8080 jad-ui:local
```

## Configuration

Runtime configuration lives in `public/config/` and is fetched at startup, so it
can be replaced per environment without rebuilding:

| File | Purpose |
| --- | --- |
| `app-config.json` | Menu items, health-check interval, and view descriptions. |
| `redline-config.json` | Redline backend base URL and participant DID prefix. |
| `auth-config.json` | Keycloak issuer/client and OIDC redirect settings. |
| `participant-config.json` | DID scheme, upload limits, file-sharing and Siglet proxy URLs. |

The shared policy schema is served separately at `config/jad-profile.json`; its
source is `ops/jad-profile-seed/jad-profile.json`, not `public/config/`.

If `redline-config.json` is missing or invalid, JAD UI falls back to built-in
defaults (`http://localhost:8081`). See `src/app/redline/redline.config.ts`.

`participant-config.json`'s `did.scheme` selects `http` or `https` for public
`did:web` document requests; the development default is `http`. Use HTTPS for
trusted production resolution. The browser resolves host-only DIDs at
`/.well-known/did.json` and path DIDs at `/<path>/did.json`; successful endpoints
are cached during the session. DID document requests never carry the app bearer
token, including when the DID host is the same origin.

Local EDC proxy access relies on jwtlet and Kubernetes service-account tokens.
Provisioning participant identities therefore requires access to jwtlet and
`kubectl`.

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
The checked-in `/proxy/siglet` URL is the local Siglet token proxy; configure a
CORS-enabled, participant-scoped proxy for shared deployments. Keep
`/proxy/default` on the control-plane health API.

## Tenant dataspace membership

The public `/register` form and the operator's Register Tenant form collect tenant
data only. `RedlineService.registerTenant` explicitly sends `dataspaceInfos: []`;
registration never joins a dataspace and does not require any dataspaces to exist.

After the operator deploys the participant and the admin can sign in, the
**Dataspaces** view at `/dataspaces` manages memberships for that tenant.
`ParticipantContextService` resolves the authenticated participant's DID to its
Redline tenant; there is no tenant/provider selector. The view reads all available
dataspaces and the tenant's memberships across its participants.

- **Join / Save membership** uses
  `POST /api/ui/service-providers/1/tenants/{tenantId}/dataspaces` with a
  `DataspaceInfo` body. Roles and agreement types are comma-separated; properties
  must be a JSON object. Existing values are prefilled and all metadata fields
  are sent on save because omitted fields are reset by Redline. Partner references
  are preserved when updating.
- **Leave** uses
  `DELETE /api/ui/service-providers/1/tenants/{tenantId}/dataspaces/{dataspaceId}`.
  Confirmation warns that membership and partner references are removed from
  **all** of the tenant's participants.
- These APIs manage **local membership metadata only**. They do not deploy or
  deprovision participant resources or issue/revoke credentials. Redline selects
  an existing membership's participant; joining a new dataspace is rejected if
  participant selection is ambiguous. Backend errors are shown without silently
  changing membership state.

The existing `tenant-admin` role controls both route access and menu visibility;
no new Keycloak role, mapper, token claim, or identity-sync behavior is needed.
Backend authorization remains Redline's responsibility.

## Partner references

Partner references are stored **per dataspace membership** of the authenticated
participant (`dataspace_info_partners` in Redline, keyed by `dataspace_info`), not
per tenant or globally. A participant that has not joined a dataspace has no
place to store partners, and writing to a dataspace the participant has not
joined fails with `404 Dataspace info not found for participant …`.

The **Partners** view at `/partners` therefore works per dataspace:

- It lists every dataspace the participant joined (`GET
/api/ui/service-providers/1/tenants/{tenantId}/participants/{participantId}/dataspaces`)
  together with that dataspace's partners (`GET …/partners/{dataspaceId}`), and
  groups the stored partners by dataspace. Partner display names come from the
  Redline tenant of the matching participant DID.
- **Add selected** writes to the dataspace chosen in the view (defaulting to the
  first joined one) via
  `POST …/participants/{participantId}/partners/{dataspaceId}`. The candidate
  list contains registered participants of other tenants that are not yet
  partners of that dataspace.
- **Add unregistered partner** creates a reference for any identifier (for
  counterparties not registered under this service provider), with an optional
  nickname and a properties JSON object. Redline validates neither, so entries
  are only meaningful to the connector/policy tooling that reads them.
- Per-dataspace results (including backend messages) are shown inline in the
  add panel instead of a single global alert, and a failure keeps the selection
  so a retry does not require re-selecting.
- Removing partners is unavailable: the Redline API has no delete-partner
  endpoint. Leaving a dataspace (`/dataspaces`) still removes its partners.

`PartnerService` exposes `getPartners()` (deduplicated across all joined
dataspaces) for partner-name lookups in Files, Explore and transfer history, and
the dataspace-scoped `getDataspacePartners()`, `getPartnersForDataspace()` and
`addPartner(dataspaceId, partner)` for the view.

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

`KeycloakAuthProvider` uses OAuth 2.0 / OpenID Connect with Keycloak. The app's
session state is held in memory; startup removes legacy token-bearing app session
copies from local storage. The OAuth library manages its own token storage.

The bearer interceptor automatically adds tokens only to same-origin, non-public
requests. Cross-origin Redline requests do not receive a bearer token automatically;
file-sharing and Siglet requests use their explicit authorization headers.

Three realm roles are supported:

- **tenant-admin** — Dataspaces, Partners, Policy Builder and EDC views (catalog, assets, policies, contract definitions, contracts, transfers).
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

1. Add local host mapping:

```text
127.0.0.1 keycloak.jad.localhost
```

2. Deploy all dev services (or only Keycloak with `kubectl apply -k ops/keycloak/`):

```bash
kubectl apply -k ops/
```

3. Verify:

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
- the demo `operator` user with its operator-specific attribute; participant users are created by keycloakagent

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
`tenant-admin`. Conflicting tenant-role mappings are removed from synced users. Only create/update is performed — users no
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
- `DID_SCHEME` — `http` (development default) or `https` for DID documents. The
  agent retains its existing `/<path>/.well-known/did.json` path convention,
  distinct from the browser's standard path-DID URL.

See [remote download setup and browser verification](ops/transfer-download/README.md).
Run agent tests with `python -m unittest discover -s ops/keycloakagent -v`
(requires `requests` and `kubectl` for the rendered ConfigMap check).

On initial creation, the agent uses the path of `did:web:identity.jad.localhost:<path>`
as the tenant-user's username and password. The admin login is `<path>-admin`
with initial password `admin`. Subsequent syncs update attributes and roles but
never reset existing passwords; change these development credentials for any
shared environment.

Both logins currently use the same EDC proxy service-account jwtlet mapping.
The deployment explicitly sets `JWTLET_SCOPES` to retain the existing management
scopes and add `siglet-token` for participant-bound transfer-token retrieval. Restricting EDC scopes per login requires separate proxy/token identities;
the UI role split alone does not enforce backend least privilege.

## Project structure

```text
jad-ui/
├── src/
│   ├── main.ts                  # standalone application bootstrap
│   ├── app/
│   │   ├── app.config.ts        # router, HTTP, auth and runtime config providers
│   │   ├── app.routes.ts        # top-level and lazy-loaded shell child routes
│   │   ├── auth/                # auth service, Keycloak provider and access rules
│   │   ├── redline/             # shared Redline config, models and service
│   │   ├── runtime-config.ts    # common runtime configuration initializer
│   │   ├── login/               # login view
│   │   ├── registration/        # public tenant-registration form
│   │   └── shell/               # dashboard shell wrapper and user menu
│   ├── participant-view/
│   │   ├── dataspaces/          # tenant-admin membership management via Redline
│   │   ├── policy-builder/      # schema-driven ODRL builder and validation
│   │   ├── edc-controllers/     # custom management API controllers
│   │   └── files/ explore/ partners/ services/ models/ utils/
│   ├── operator-view/
│   │   ├── util/                # deployment and DID helpers
│   │   └── tenant-view/         # tenants and open-registrations UI
│   └── styles.css               # Tailwind and daisyUI themes
├── public/config/               # environment-specific runtime JSON
├── ops/
│   ├── kustomization.yaml       # shared dev-services entry point
│   ├── keycloak/                # Gateway API-only Keycloak deployment
│   ├── keycloakagent/           # Redline participant identity sync
│   └── jad-profile-seed/        # shared schema and temporary schema/CEL seed Job
├── angular.json                 # jad-ui build, serve and test targets
├── package.json                 # jad-ui dependencies and npm commands
├── Dockerfile                   # Angular build stage and unprivileged Nginx runtime
└── nginx.conf                   # SPA fallback and runtime-config serving
```
