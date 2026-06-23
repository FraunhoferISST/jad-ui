import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';

/**
 * Logs the current user out and redirects to the login view.
 *
 * Implemented as a guard so the `logout` route needs no component: the guard
 * performs the side effect and returns a redirect `UrlTree`.
 *
 * The logout is awaited so the redirect happens only after the session is
 * cleared. A provider-side logout failure must not strand the user on a
 * protected route, so any rejection is swallowed: {@link AuthService.logout}
 * always clears the local session in its `finally` block, so the user ends up
 * logged out locally and is redirected to `/login` regardless.
 */
export const logoutGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  try {
    await auth.logout();
  } catch {
    // Local session is already cleared; ignore provider-side logout failures.
  }

  return router.createUrlTree(['/login']);
};
