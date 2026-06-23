import { Routes } from '@angular/router';
import { authGuard, authChildGuard } from './auth/guards/auth.guard';
import { roleGuard } from './auth/guards/role.guard';
import { logoutGuard } from './auth/guards/logout.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent),
  },
  {
    // Side-effect-only route: clears the session and redirects to /login.
    path: 'logout',
    canActivate: [logoutGuard],
    children: [],
  },
  {
    // Authenticated shell layout. Children render inside the dashboard shell's
    // router-outlet. `authGuard` enforces authentication, `roleGuard` enforces
    // per-view role access (driven by ACCESS_RULES).
    path: '',
    loadComponent: () => import('./shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    canActivateChild: [authChildGuard, roleGuard],
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
      {
        path: 'home',
        loadComponent: () => import('@eclipse-edc/dashboard-core/home').then(m => m.HomeViewComponent),
      },
      {
        path: 'assets',
        loadComponent: () =>
          import('@eclipse-edc/dashboard-core/assets').then(m => m.AssetViewComponent),
      },
      {
        path: 'policies',
        loadComponent: () =>
          import('@eclipse-edc/dashboard-core/policies').then(m => m.PolicyViewComponent),
      },
      {
        path: 'contract-definitions',
        loadComponent: () =>
          import('@eclipse-edc/dashboard-core/contract-definitions').then(
            m => m.ContractDefinitionsViewComponent,
          ),
      },
      {
        path: 'contracts',
        loadComponent: () =>
          import('@eclipse-edc/dashboard-core/transfer').then(m => m.ContractViewComponent),
      },
      {
        path: 'catalog',
        loadComponent: () =>
          import('@eclipse-edc/dashboard-core/catalog').then(m => m.CatalogViewComponent),
      },
      {
        path: 'transfer-history',
        loadComponent: () =>
          import('@eclipse-edc/dashboard-core/transfer').then(m => m.TransferHistoryViewComponent),
      },
      {
        path: 'tenants',
        loadComponent: () =>
          import('../operator-view/tenant-view/tenant-view.component').then(
            m => m.TenantViewComponent,
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
