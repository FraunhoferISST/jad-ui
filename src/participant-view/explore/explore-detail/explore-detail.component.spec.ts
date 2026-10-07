import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { ContractAgreement } from '@think-it-labs/edc-connector-client';

import { CatalogService } from '../../services/catalog.service';
import { TransferService } from '../../services/transfer.service';
import { ExploreDetailComponent } from './explore-detail.component';

describe('ExploreDetailComponent history loading', () => {
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
      ],
    });
    const component = TestBed.runInInjectionContext(() => new ExploreDetailComponent());
    component.file = { id: 'file', name: 'file.txt', origin: 'remote', uploadedAt: 0 };
    component.ngOnChanges({ file: new SimpleChange(undefined, component.file, true) });
    expect(getHistory).not.toHaveBeenCalled();
    expect(component.loadingTransferHistory).toBeTrue();

    const agreement = new ContractAgreement();
    agreement.id = 'agreement';
    getHistory.and.callFake(async (file) => {
      expect(file.agreements).toEqual([agreement]);
      return [];
    });
    resolveAgreements([agreement]);
    await agreements;
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(getHistory).toHaveBeenCalledOnceWith(component.file);
    expect(component.loadingAgreements).toBeFalse();
    expect(component.loadingTransferHistory).toBeFalse();
  });
});
