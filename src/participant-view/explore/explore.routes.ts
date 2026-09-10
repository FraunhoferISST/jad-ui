import { Routes } from '@angular/router';

export const EXPLORE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./explore-list/explore-list.component').then(m => m.ExploreListComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./explore-detail/explore-detail.component').then(m => m.ExploreDetailComponent),
  },
];
