import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { ContractAgreement } from '@think-it-labs/edc-connector-client';
import { FileActivityComponent } from '../../file-activity/file-activity.component';
import { FileAsset } from '../../models/file-asset.model';
import { CatalogService } from '../../services/catalog.service';
import { TransferService } from '../../services/transfer.service';
import { FileDownloadService } from '../../services/file-download.service';
import { ExploreDetailComponent } from './explore-detail.component';

describe('ExploreDetailComponent activity', () => {
  it('waits for agreements before querying transfer history', async () => {
    let resolveAgreements!: (agreements: ContractAgreement[]) => void;
    const agreements = new Promise<ContractAgreement[]>((resolve) => {
      resolveAgreements = resolve;
    });
    const getHistory = jasmine.createSpy('getFileTransferHistory').and.resolveTo([]);
    TestBed.configureTestingModule({
      providers: [
        { provide: ModalAndAlertService, useValue: {} },
        { provide: CatalogService, useValue: { getAgreementsForFile: () => agreements } },
        { provide: TransferService, useValue: { getFileTransferHistory: getHistory } },
        { provide: FileDownloadService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(ExploreDetailComponent);
    const file: FileAsset = { id: 'file', name: 'file.txt', origin: 'remote', uploadedAt: 0 };
    fixture.componentRef.setInput('file', file);
    fixture.autoDetectChanges();
    const activity = fixture.debugElement.query(By.directive(FileActivityComponent))
      .componentInstance as FileActivityComponent;
    expect(getHistory).not.toHaveBeenCalled();
    expect(activity.loadingTransferHistory()).toBeTrue();
    const agreement = new ContractAgreement();
    agreement.id = 'agreement';
    getHistory.and.callFake(async (value) => {
      expect(value.agreements).toEqual([agreement]);
      return [];
    });
    resolveAgreements([agreement]);
    await fixture.whenStable();
    expect(getHistory).toHaveBeenCalledOnceWith(file);
    expect(activity.loadingAgreements()).toBeFalse();
    expect(activity.loadingTransferHistory()).toBeFalse();
    expect(fixture.componentInstance.hasAccess()).toBeTrue();
  });

  it('refreshes agreements and access state after a successful access request', async () => {
    const agreement = new ContractAgreement();
    agreement.id = 'agreement';
    const getAgreements = jasmine
      .createSpy('getAgreementsForFile')
      .and.returnValues(Promise.resolve([]), Promise.resolve([agreement]));
    const requestAccess = jasmine.createSpy('requestAccess').and.resolveTo();
    const showAlert = jasmine.createSpy('showAlert');
    TestBed.configureTestingModule({
      providers: [
        { provide: ModalAndAlertService, useValue: { showAlert } },
        {
          provide: CatalogService,
          useValue: { getAgreementsForFile: getAgreements, requestAccess },
        },
        { provide: TransferService, useValue: { getFileTransferHistory: async () => [] } },
        { provide: FileDownloadService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(ExploreDetailComponent);
    fixture.componentRef.setInput('file', {
      id: 'file',
      name: 'file.txt',
      origin: 'remote',
      uploadedAt: 0,
    });
    fixture.autoDetectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.hasAccess()).toBeFalse();
    await fixture.componentInstance.requestAccess();
    await fixture.whenStable();
    expect(fixture.componentInstance.hasAccess()).toBeTrue();
    expect(getAgreements).toHaveBeenCalledTimes(2);
    expect(showAlert).toHaveBeenCalledWith(
      'Access granted successfully.',
      'Access request',
      'success',
      5,
    );
  });
});
