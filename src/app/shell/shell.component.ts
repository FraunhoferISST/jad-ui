import { Component, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppConfig, DashboardAppComponent, DashboardStateService, EdcConfig, MenuItem } from '@eclipse-edc/dashboard-core';
import { AuthService } from '../auth/auth.service';
import { canAccess } from '../auth/access-rules';
import { REDLINE_CONFIG } from '../../operator-view/redline.config';

/** Local-storage key the library's DashboardStateService uses to persist the
 * currently selected connector. We clear it on load so the connector is chosen
 * deterministically by role instead of being restored from a previous session. */
const CURRENT_CONNECTOR_KEY = 'currentConnector';

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
  private readonly redlineConfig = inject(REDLINE_CONFIG);
  private readonly stateService: DashboardStateService;

  constructor() {
    // The library's DashboardStateService restores the previously selected
    // connector from local storage in its constructor. Clear that key *before*
    // the service is first injected (and therefore constructed) so it cannot
    // restore a stale or wrong-role connector. The active connector is then set
    // deterministically by role in `ngOnInit`.
    localStorage.removeItem(CURRENT_CONNECTOR_KEY);
    this.stateService = inject(DashboardStateService);
  }

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
    // Participants talk to the dataspace connectors as usual. Operators do not:
    // their shell surfaces the Redline backend as the single "connector" so the
    // navbar's health indicator reflects the Redline backend's health. The
    // library calls `${defaultUrl}/check/health`, which the gateway in front of
    // Redline is expected to route to the Redline health endpoint.
    const configs$: Promise<EdcConfig[]> =
      this.auth.role() === 'operator'
        ? Promise.resolve([this.toEdcConfig(this.redlineConfig.baseUrl)])
        : firstValueFrom(this.http.get<EdcConfig[]>('config/edc-connector-config.json'));

    // Assigned synchronously so the library's `ngAfterViewInit` can await it.
    this.edcConfigs = configs$.then(configs => {
      // Make the first connector of the active role the current one. With the
      // persisted connector already cleared in the constructor, this is the
      // single source of truth for the initial selection.
      if (configs.length > 0) {
        this.stateService.setCurrentEdcConfig(configs[0]);
      }
      return configs;
    });

    this.appConfig = firstValueFrom(this.http.get<AppConfig>('config/app-config.json')).then(
      config => this.applyRoleMenu(config),
    );
  }

  /**
   * Builds the single {@link EdcConfig} that points the dashboard shell (and its
   * health check) at the Redline backend.
   */
  private toEdcConfig(baseUrl: string): EdcConfig {
    const url = baseUrl.replace(/\/$/, '');
    return {
      connectorName: 'Redline',
      managementUrl: url,
      defaultUrl: url,
      protocolUrl: url,
      federatedCatalogEnabled: false,
    };
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

    // Operators see the dedicated "JAD Operator" title; everyone else keeps the
    // title from the shared config (or the library default).
    const appTitle = role === 'operator' ? 'JAD Operator' : config.appTitle;

    return { ...config, appTitle, menuItems: [...items, logoutItem] };
  }
}
