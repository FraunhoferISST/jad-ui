import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/**
 * Standalone, full-screen login view.
 *
 * Renders outside the dashboard shell (no menu). On success it navigates to the
 * `returnUrl` query param (set by {@link authGuard}) or to the home view.
 * Already-authenticated users are redirected away immediately.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      void this.redirect();
    }
  }

  protected async submit(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.login({
        username: this.username(),
        password: this.password(),
      });
      await this.redirect();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      this.loading.set(false);
    }
  }

  private async redirect(): Promise<void> {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/home';
    await this.router.navigateByUrl(returnUrl);
  }
}
