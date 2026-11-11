import { TestBed } from '@angular/core/testing';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { FileAsset } from '../../models/file-asset.model';
import { CatalogService } from '../../services/catalog.service';
import { FileDownloadService } from '../../services/file-download.service';
import { FilesService } from '../../services/files.service';
import { PartnerService } from '../../services/partner.service';
import { ExploreListComponent } from './explore-list.component';

describe('ExploreListComponent', () => {
  it('combines search and company filters and reloads after access is granted', async () => {
    const files: FileAsset[] = [
      {
        id: 'one',
        name: 'Report',
        partnerName: 'Acme',
        partnerDid: 'did:web:acme',
        uploadedAt: 0,
        origin: 'remote',
      },
      {
        id: 'two',
        name: 'Report',
        partnerName: 'Beta',
        partnerDid: 'did:web:beta',
        uploadedAt: 0,
        origin: 'remote',
      },
    ];
    const getFiles = jasmine.createSpy('getFilesForExploreView').and.resolveTo(files);
    const getPartners = jasmine.createSpy('getPartners').and.resolveTo([]);
    const requestAccess = jasmine.createSpy('requestAccess').and.resolveTo();
    const alerts = jasmine.createSpyObj('ModalAndAlertService', ['showAlert', 'openModal']);
    TestBed.configureTestingModule({
      providers: [
        { provide: ModalAndAlertService, useValue: alerts },
        { provide: FilesService, useValue: { getFilesForExploreView: getFiles } },
        { provide: PartnerService, useValue: { getPartners } },
        { provide: CatalogService, useValue: { requestAccess } },
        { provide: FileDownloadService, useValue: {} },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new ExploreListComponent());
    await Promise.resolve();
    await Promise.resolve();
    component.filter(' report ');
    component.companyFilter.set('did:web:beta');
    expect(component.filteredFiles()).toEqual([files[1]]);
    await component.requestAccess(files[1]);
    expect(requestAccess).toHaveBeenCalledOnceWith(files[1]);
    expect(getFiles).toHaveBeenCalledTimes(2);
    expect(component.requestingAccessId()).toBeNull();
    expect(alerts.showAlert).toHaveBeenCalledWith(
      'Access granted successfully.',
      'Access request',
      'success',
      5,
    );
    // Do not hide malformed records solely because the search is empty.
    const incomplete = { id: 'incomplete', origin: 'remote', uploadedAt: 0 } as FileAsset;
    component.files.update((items) => [...items, incomplete]);
    component.filter('');
    component.companyFilter.set('');
    expect(component.filteredFiles()).toContain(incomplete);
  });
});
