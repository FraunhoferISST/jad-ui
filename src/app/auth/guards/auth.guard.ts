import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../auth.service';

/**
 * Allows navigation only when a user is authenticated. Otherwise redirects to
 * the login view, preserving the attempted URL as `returnUrl` so the user is
 * sent back after a successful login.
 */
export const authGuard: CanActivateFn = (_route, state: RouterStateSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

/** Child-route variant of {@link authGuard}. */
export const authChildGuard: CanActivateChildFn = (route, state) => authGuard(route, state);
