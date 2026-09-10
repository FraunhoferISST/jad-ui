import { Routes } from '@angular/router';

export const FILES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./files-list/files-list.component').then(m => m.FilesListComponent),
  },
  {
    path: 'upload',
    loadComponent: () =>
      import('./file-upload/file-upload.component').then(m => m.FileUploadComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./file-detail/file-detail.component').then(m => m.FileDetailComponent),
  },
];
