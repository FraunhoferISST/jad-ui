import { Routes } from '@angular/router';

export const FILES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./files-list/files-list.component').then(m => m.FilesListComponent),
  },
];
