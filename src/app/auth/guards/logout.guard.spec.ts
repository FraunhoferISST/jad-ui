import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { logoutGuard } from './logout.guard';
import { AuthService } from '../auth.service';

describe('logoutGuard', () => {
  let logoutSpy: jasmine.Spy<() => Promise<void>>;

  function configure(logout: () => Promise<void>): void {
    logoutSpy = jasmine.createSpy('logout', logout).and.callThrough();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { logout: logoutSpy } },
      ],
    });
  }

  async function runGuard(): Promise<UrlTree> {
    return TestBed.runInInjectionContext(() =>
      logoutGuard({} as never, {} as never),
    ) as Promise<UrlTree>;
  }

  it('logs out and redirects to /login', async () => {
    configure(() => Promise.resolve());

    const result = await runGuard();

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login');
  });

  it('still redirects to /login when logout rejects', async () => {
    configure(() => Promise.reject(new Error('provider failure')));

    const result = await runGuard();

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login');
  });
});
