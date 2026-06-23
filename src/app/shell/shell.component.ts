import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppConfig, DashboardAppComponent, EdcConfig, MenuItem } from '@eclipse-edc/dashboard-core';
import { AuthService } from '../auth/auth.service';
import { canAccess } from '../auth/access-rules';

/**
 * Authenticated layout that hosts the dashboard shell (`lib-dashboard-app`).
 *
 * The library shell owns the router-outlet (where child routes render) and
 * renders the navigation menu purely from the `AppConfig.menuItems` it is
 * given. This component therefore:
 *  - loads the base configuration like the previous root component did, and
 *  - filters the menu items by the current user's role (using the same
 *    {@link ACCESS_RULES} the route guard uses) and appends a logout entry,
 * before passing the configuration to the shell.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [DashboardAppComponent],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  protected readonly themes = [
    'light',
    'dark',
    'dim',
    'aqua',
    'nord',
    'synthwave',
    'forest',
    'dracula',
    'night',
    'coffee',
    'emerald',
  ];

  protected edcConfigs?: Promise<EdcConfig[]>;
  protected appConfig?: Promise<AppConfig>;

  ngOnInit(): void {
    this.edcConfigs = firstValueFrom(
      this.http.get<EdcConfig[]>('config/edc-connector-config.json'),
    );
    this.appConfig = firstValueFrom(this.http.get<AppConfig>('config/app-config.json')).then(
      config => this.applyRoleMenu(config),
    );
  }

  /**
   * Returns a copy of the config whose menu only contains items the current
   * role may access, with a logout entry appended.
   */
  private applyRoleMenu(config: AppConfig): AppConfig {
    const role = this.auth.role();

    const visibleItems = (config.menuItems ?? []).filter(item =>
      canAccess(item.routerPath, role),
    );

    // Force a divider after the last role-visible item so the appended logout
    // entry is visually separated from the regular navigation items. Copy each
    // item first to avoid mutating the loaded config.
    const items = visibleItems.map(item => ({ ...item }));
    if (items.length > 0) {
      items[items.length - 1].divider = true;
    }

    const logoutItem: MenuItem = {
      text: 'Logout',
      materialSymbol: 'logout',
      routerPath: 'logout',
    };

    return { ...config, menuItems: [...items, logoutItem] };
  }
}
