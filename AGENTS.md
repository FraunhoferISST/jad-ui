# AGENTS.md

Angular 21 (standalone components, lazy-loaded routes) dashboard for Eclipse Dataspace Components, with custom operator/participant views. The README has thorough architecture and dev-env docs; this file captures the non-obvious working constraints.

## Commands

- `npm start` — dev server `ng serve` (port 4200). Only runnable with Keycloak reachable (login required).
- `npm test` — Karma + Jasmine (Angular `@angular/build:karma`). **Requires Chrome**; no headless/CI launcher is configured, so it only runs where Chrome is installed.
- `npm run build` — production build with budget checks (initial ≤1MB error).
- **There is no lint or typecheck script.** There is no `tslint`/`eslint` config. To typecheck use `npx tsc -b` (project references) or `ng build`. `tsconfig.json` is strict (`strict`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, strict templates).
- Prettier is configured via `package.json` (`printWidth: 100`, `singleQuote`, Angular HTML parser). No formatter script exists — run `npx prettier` directly.
- Tests use Jasmine (`*.spec.ts`, colocated). Angular CLI generates matching spec files; keep them.

## Install gotchas

- Run `npm install` after any change to `package.json` (esp. the EDC client tarball or `@eclipse-edc`).
- **`@eclipse-edc`** packages come from GitHub Packages (`.npmrc` points the scope there); requires a PAT with `read:packages`.
- **`@think-it-labs/edc-connector-client`** is installed from a **local tarball** pinned in `package.json` (`./think-it-labs-edc-connector-client-0.10.0.tgz`), not from npm. Don't bump its version to a registry version, and don't delete the tarball.
- `npm overrides` pins `@babel/core`, `esbuild`, `vite`, `piscina` — keep them when dependency work touches those.
- Node 20.19+ / 22.12+ required.

## Architecture

- Entrypoint: `src/main.ts` → `bootstrapApplication(App, appConfig)`. Providers are assembled in `src/app/app.config.ts`, not via NgModules.
- Views are **lazy-loaded** from `src/app/app.routes.ts`. Library EDC views come from `@eclipse-edc/dashboard-core/<feature>` (home, assets, policies, contract-definitions, contract/transfer, catalog); custom code lives under `src/participant-view/` (files, explore, partners) and `src/operator-view/` (tenants, open-registrations).
- **Two roles**: `participant` (EDC views) and `operator` (tenants/registrations), both get `home`.
- **`ACCESS_RULES` (`src/app/auth/access-rules.ts`) is the single source of truth** for both the route guard (`roleGuard`) and the shell menu filter. When adding a route you must keep three things in sync: `app.routes.ts`, `ACCESS_RULES`, and `public/config/app-config.json` menu items. Unknown route paths default to "allowed for any authenticated user" via `canAccess`, so forgetting ACCESS_RULES doesn't lock users out but does make a route appear in the menu for the wrong role — verify menu filtering.
- `authGuard`/`authChildGuard`/`roleGuard` in `src/app/auth/guards/`; `/logout` is a side-effect-only route guarded by `logoutGuard`.
- Login requires role-specific Keycloak token claims; missing claims reject login during callback (`participant` needs `participant_context_id` + `edc_connector_config`; `operator` needs `operator_id`).

## Runtime config pattern

- All env-specific config is JSON under `public/config/` (`app-config.json`, `auth-config.json`, `redline-config.json`, `participant-config.json`) fetched at startup, so one build serves many environments.
- **Follow the established pattern** (see `redline.config.ts` / `keycloak-auth.config.ts`): an `InjectionToken` seeded with defaults, provided via `provideAppInitializer` that HTTP-gets the JSON and **mutates the already-injected token object in place** (so consumers holding the reference see the loaded values). Missing/invalid file → defaults retained silently.
- `public/config/` is served as static assets (see `angular.json` assets).

## EDC client calls

- The upstream management client has gaps for EDC v5 endpoints. Custom calls subclass **`EdcController` from `@think-it-labs/edc-connector-client`** (see `src/participant-view/edc-controllers/`) and issue raw `this.inner.request(...)` on `this.context.management`, passing `managementApiVersion` and `authorization` from context. Mirror that pattern for new endpoints instead of hand-rolling HTTP.
- `redline-api.json` is the Redline UI OpenAPI spec (not codegen'd into the app; services hit it directly).

## Styling

- Tailwind CSS 4 + daisyUI 5. Theme/plugin config lives in `src/styles.css` (`@plugin 'daisyui'`, `@source` for `@eclipse-edc/dashboard-core` so library markup is scanned). Add new library `@source` paths when integrating more of dashboard-core.
- Use the bundled skills in `.agents/skills/` (`angular-developer`, `daisyui`) for Angular and daisyUI guidance before writing UI/components.

## Dev environment (see README for full details)

- Requires Keycloak SSO. Dev manifests under `ops/keycloak/` (`kubectl apply -k ops/keycloak/overlays/gateway`). Add `127.0.0.1 keycloak.jad.localhost` to your hosts file. Other dev services live on `*.jad.localhost` and are proxied in-cluster (jwtlet, EDC proxy, file-sharing).
- Participant tokens come from jwtlet (Kubernetes service accounts / token API). `create-edc-connector-config.sh` provisions participant users/tokens; `ops/keycloakagent/` (Python) keeps Redline participants in sync with Keycloak every 60s. Changes here are only create/update — nothing is ever deleted.
- `ops/` also holds Keycloak config; keep manifest/shell-script and README in sync when touching auth/identity flows.

## Keep in sync

When changing auth, roles, routes, or identity sync, reconcile: `app.routes.ts`, `ACCESS_RULES`, `public/config/app-config.json`, `ops/keycloak/` (realm roles/mappers), and the README's auth/architecture sections.
