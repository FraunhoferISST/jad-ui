import { Role } from './auth.types';

/**
 * Single source of truth mapping a route's `routerPath` to the roles allowed to
 * access it.
 *
 * Both the routing layer ({@link roleGuard}) and the navigation menu
 * (`ShellComponent` menu filter) consult this map, so the routes and the menu
 * can never drift out of sync.
 *
 * Keys are the `routerPath`/route `path` values used in `app.routes.ts` and in
 * `public/config/app-config.json`.
 */
export const ACCESS_RULES: Record<string, Role[]> = {
  home: ['operator', 'participant'],
  catalog: ['participant'],
  assets: ['participant'],
  policies: ['participant'],
  'contract-definitions': ['participant'],
  contracts: ['participant'],
  'transfer-history': ['participant'],
  tenants: ['operator'],
};

/**
 * Routes that any authenticated user may access regardless of the access map
 * (e.g. the logout route). These are never filtered out.
 */
const ROLE_AGNOSTIC_PATHS = new Set<string>(['logout']);

/**
 * Returns whether the given role may access the given route path.
 *
 * - Unknown paths default to "allowed for any authenticated user" so that
 *   adding a new route does not silently lock everyone out; restrict it by
 *   adding an entry to {@link ACCESS_RULES}.
 * - A `null` role (not authenticated) is never allowed.
 */
export function canAccess(path: string, role: Role | null): boolean {
  if (role === null) {
    return false;
  }
  if (ROLE_AGNOSTIC_PATHS.has(path)) {
    return true;
  }
  const allowed = ACCESS_RULES[path];
  if (!allowed) {
    return true;
  }
  return allowed.includes(role);
}
