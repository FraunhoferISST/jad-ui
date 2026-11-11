import { TestBed } from '@angular/core/testing';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { FileAsset } from '../../models/file-asset.model';
import { FileDownloadService } from '../../services/file-download.service';
import { FilesService } from '../../services/files.service';
import { FilesListComponent } from './files-list.component';

describe('FilesListComponent', () => {
  it('filters files reactively and clears a failed download indicator', async () => {
    const files: FileAsset[] = [
      { id: 'one', name: 'Report', type: 'text/plain', uploadedAt: 0, origin: 'owned' },
      { id: 'two', name: 'Image', type: 'image/png', uploadedAt: 0, origin: 'remote' },
    ];
    const alerts = jasmine.createSpyObj('ModalAndAlertService', [
      'showAlert',
      'openModal',
      'closeModal',
    ]);
    const download = jasmine.createSpy('download').and.rejectWith(new Error('download failed'));
    TestBed.configureTestingModule({
      providers: [
        { provide: ModalAndAlertService, useValue: alerts },
        { provide: FileDownloadService, useValue: { download } },
        { provide: FilesService, useValue: { getFilesForFilesView: async () => files } },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new FilesListComponent());
    await Promise.resolve();
    expect(component.loading()).toBeFalse();
    component.filter(' IMAGE ');
    expect(component.filteredFiles()).toEqual([files[1]]);
    component.filter('one');
    expect(component.filteredFiles()).toEqual([files[0]]);
    component.paginationEvent([files[0]]);
    expect(component.pageFiles()).toEqual([files[0]]);
    await component.download(files[0]);
    expect(component.downloadingId()).toBeNull();
    expect(alerts.showAlert).toHaveBeenCalledWith('download failed', 'Download failed', 'error', 8);
    // Empty search leaves even incomplete backend records visible.
    const incomplete = { uploadedAt: 0, origin: 'owned' } as FileAsset;
    component.files.update((items) => [...items, incomplete]);
    component.filter('');
    expect(component.filteredFiles()).toContain(incomplete);
  });
});
