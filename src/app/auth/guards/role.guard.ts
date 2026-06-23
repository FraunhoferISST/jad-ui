import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { canAccess } from '../access-rules';

/**
 * Enforces role-based access for child routes of the shell.
 *
 * The required roles are derived from the route's `path` via the central
 * {@link ACCESS_RULES} map, so this guard is the routing-side counterpart of
 * the menu filtering in the shell. When the current role is not allowed, the
 * user is redirected to the home view.
 *
 * Assumes {@link authGuard} runs first (so the user is authenticated here).
 */
export const roleGuard: CanActivateChildFn = route => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const path = route.routeConfig?.path ?? '';
  if (canAccess(path, auth.role())) {
    return true;
  }

  return router.createUrlTree(['/home']);
};
