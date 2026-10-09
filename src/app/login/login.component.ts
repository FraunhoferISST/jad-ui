import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/**
 * Standalone, full-screen login view.
 *
 * Renders outside the dashboard shell (no menu). It starts an OIDC redirect
 * flow with Keycloak and, after callback completion, navigates to the
 * `returnUrl` query param (set by {@link authGuard}) or to the home view.
 * Already-authenticated users are redirected away immediately.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly redirecting = signal(false);

  ngOnInit(): void {
    this.error.set(this.auth.consumeInitializationError());

    if (this.auth.isAuthenticated()) {
      // Already logged in (e.g. returning from the Keycloak callback whose
      // redirectUri is /login). Show a transitional state while the async
      // navigateByUrl() lazy-loads the shell/home — without this the login
      // form flashes for ~1s after a successful login.
      this.redirecting.set(true);
      void this.redirect();
    }
  }

  protected async signInWithSso(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    try {
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/home';
      await this.auth.login(returnUrl);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      this.loading.set(false);
    }
  }

  private async redirect(): Promise<void> {
    const returnUrl =
      this.auth.consumePostLoginRedirectUrl() ??
      this.route.snapshot.queryParamMap.get('returnUrl') ??
      '/home';
    await this.router.navigateByUrl(returnUrl);
  }
}
