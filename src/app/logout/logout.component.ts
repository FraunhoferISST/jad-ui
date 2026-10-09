import { Component, inject, OnInit } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/**
 * Standalone, full-screen sign-out view.
 *
 * Renders outside the dashboard shell (like `/login`). It clears the session
 * and relies on the provider's full-page OAuth logout navigation to the IdP's
 * `end_session` endpoint (`post_logout_redirect_uri` points back to `/login`).
 * The spinner remains visible until the browser unloads the page, so the user
 * sees a "Signing you out…" state instead of the previous view lingering or
 * flashing the login form.
 */
@Component({
  selector: 'app-logout',
  standalone: true,
  templateUrl: './logout.component.html',
})
export class LogoutComponent implements OnInit {
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    void this.auth.logout().catch(() => {
      // Local session is cleared in AuthService.logout() even when the
      // provider-side logout fails; the full-page navigation still proceeds.
    });
  }
}
