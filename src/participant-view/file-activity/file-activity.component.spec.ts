import { TestBed } from '@angular/core/testing';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { ContractAgreement } from '@think-it-labs/edc-connector-client';
import { FileAsset } from '../models/file-asset.model';
import { CatalogService } from '../services/catalog.service';
import { TransferService } from '../services/transfer.service';
import { FileActivityComponent } from './file-activity.component';

describe('FileActivityComponent', () => {
  it('loads agreements before history and resolves owned partner labels', async () => {
    const agreement = new ContractAgreement();
    agreement.id = 'agreement';
    agreement.setValue('edc', 'consumerId', 'did:web:bob');
    const getHistory = jasmine.createSpy('getFileTransferHistory').and.resolveTo([]);
    const file: FileAsset = { id: '1', name: 'test', origin: 'owned', uploadedAt: 0 };
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogService, useValue: { getAgreementsForFile: async () => [agreement] } },
        { provide: TransferService, useValue: { getFileTransferHistory: getHistory } },
        { provide: ModalAndAlertService, useValue: { showAlert: jasmine.createSpy('showAlert') } },
      ],
    });
    const fixture = TestBed.createComponent(FileActivityComponent);
    fixture.componentRef.setInput('file', file);
    fixture.componentRef.setInput('contractSharing', {
      summary: '1 partner',
      partners: [{ identifier: 'did:web:bob', nickname: 'Bob' }],
    });
    fixture.autoDetectChanges();
    await fixture.whenStable();
    expect(file.agreements).toEqual([agreement]);
    expect(getHistory).toHaveBeenCalledOnceWith(file);
    expect(fixture.componentInstance.agreementPartnerName(agreement)).toBe('Bob');
    expect(fixture.nativeElement.textContent).toContain('Bob');
    expect(fixture.nativeElement.textContent).toContain('No transfer history available.');
  });

  it('shows errors and continues loading transfer history after an agreement failure', async () => {
    const showAlert = jasmine.createSpy('showAlert');
    const getHistory = jasmine.createSpy('getFileTransferHistory').and.resolveTo([]);
    const file: FileAsset = { id: '1', name: 'test', origin: 'remote', uploadedAt: 0 };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CatalogService,
          useValue: {
            getAgreementsForFile: async () => {
              throw new Error('offline');
            },
          },
        },
        { provide: TransferService, useValue: { getFileTransferHistory: getHistory } },
        { provide: ModalAndAlertService, useValue: { showAlert } },
      ],
    });
    const fixture = TestBed.createComponent(FileActivityComponent);
    fixture.componentRef.setInput('file', file);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    expect(showAlert).toHaveBeenCalledWith('offline', 'Failed to load agreements', 'error', 8);
    expect(file.agreements).toEqual([]);
    expect(getHistory).toHaveBeenCalledOnceWith(file);
    expect(fixture.componentInstance.loadingAgreements()).toBeFalse();
    expect(fixture.componentInstance.loadingTransferHistory()).toBeFalse();
  });
});
