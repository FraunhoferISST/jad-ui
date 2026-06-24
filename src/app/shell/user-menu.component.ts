import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/**
 * User dropdown rendered in the dashboard shell's navbar-end region.
 *
 * The library's `lib-dashboard-app` does not expose content projection for the
 * navbar; instead it renders any component classes passed to its
 * `navbarEndComponents` input via `ngComponentOutlet`. This component is that
 * injected slot: it shows the signed-in user and offers a logout action.
 *
 * Logout is performed by navigating to the side-effect-only `/logout` route
 * (handled by `logoutGuard`), which clears the session and redirects to
 * `/login`.
 */
@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './user-menu.component.html',
})
export class UserMenuComponent {
  private readonly auth = inject(AuthService);

  /** The signed-in user, or `null` when not authenticated. */
  protected readonly user = this.auth.user;

  /** Display label for the user: the display name when set, else the username. */
  protected readonly label = computed(() => {
    const user = this.user();
    return user?.displayName ?? user?.username ?? '';
  });
}
