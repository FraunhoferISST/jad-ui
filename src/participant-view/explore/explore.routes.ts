import { Routes } from '@angular/router';

export const EXPLORE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./explore-list/explore-list.component').then(m => m.ExploreListComponent),
  },
];
