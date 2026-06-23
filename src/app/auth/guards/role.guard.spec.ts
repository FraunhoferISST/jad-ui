import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  UrlTree,
} from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from '../auth.service';
import { Role } from '../auth.types';

function runRoleGuard(path: string): boolean | UrlTree {
  const route = { routeConfig: { path } } as ActivatedRouteSnapshot;
  // The second (state) argument is unused by the guard.
  return TestBed.runInInjectionContext(() =>
    roleGuard(route, {} as never),
  ) as boolean | UrlTree;
}

describe('roleGuard', () => {
  function configure(role: Role | null): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { role: () => role } },
      ],
    });
  }

  it('allows access when the role may access the route', () => {
    configure('operator');

    expect(runRoleGuard('tenants')).toBe(true);
  });

  it('redirects to /home when the role may not access the route', () => {
    configure('participant');

    const result = runRoleGuard('tenants');

    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/home');
  });

  it('redirects to /home for an unauthenticated (null) role', () => {
    configure(null);

    const result = runRoleGuard('home');

    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/home');
  });
});
