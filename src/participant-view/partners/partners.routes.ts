import { Routes } from '@angular/router';

export const PARTNERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./partners-list/partners-list.component').then(m => m.PartnersListComponent),
  },
];
