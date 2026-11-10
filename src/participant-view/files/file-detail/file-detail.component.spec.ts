import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EdcClientService, ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { ContractDefinition } from '@think-it-labs/edc-connector-client';

import { FileAsset } from '../../models/file-asset.model';
import { CatalogService } from '../../services/catalog.service';
import { FileSharingApiService } from '../../services/file-sharing-api.service';
import { PartnerService } from '../../services/partner.service';
import { TransferService } from '../../services/transfer.service';
import { FileDetailComponent } from './file-detail.component';

const openPolicy = { '@type': 'Set' };
const partnerPolicy = (...ids: string[]) => ({
  '@type': 'Set',
  permission: [
    {
      action: 'use',
      constraint: [
        {
          leftOperand: 'CounterPartyId',
          operator: 'isAnyOf',
          rightOperand: ids,
        },
      ],
    },
  ],
});

describe('FileDetailComponent sharing', () => {
  let definition: ContractDefinition;
  let policies: Map<string, unknown>;
  let getDefinition: jasmine.Spy;
  let getPolicy: jasmine.Spy;
  let getPartners: jasmine.Spy;
  let getAgreements: jasmine.Spy;
  let getHistory: jasmine.Spy;
  let downloadFile: jasmine.Spy;
  let showAlert: jasmine.Spy;

  beforeEach(() => {
    definition = new ContractDefinition();
    definition.id = 'consumer-share';
    definition.setValue('edc', 'accessPolicyId', 'access');
    definition.setValue('edc', 'contractPolicyId', 'contract');
    policies = new Map<string, unknown>([
      ['access', partnerPolicy('did:web:alice', 'did:web:bob')],
      ['contract', openPolicy],
    ]);
    getDefinition = jasmine.createSpy('getDefinition').and.resolveTo(definition);
    getPolicy = jasmine
      .createSpy('getPolicy')
      .and.callFake(async (id: string) => ({ policy: policies.get(id) }));
    getPartners = jasmine.createSpy('getPartners').and.resolveTo([
      { identifier: 'did:web:alice', nickname: 'Alice Ltd' },
      { identifier: 'did:web:bob', nickname: 'Bob Ltd' },
    ]);
    getAgreements = jasmine.createSpy('getAgreementsForFile').and.resolveTo([]);
    getHistory = jasmine.createSpy('getFileTransferHistory').and.resolveTo([]);
    downloadFile = jasmine.createSpy('downloadFile').and.resolveTo();
    showAlert = jasmine.createSpy('showAlert');
    TestBed.configureTestingModule({
      imports: [FileDetailComponent],
      providers: [
        {
          provide: EdcClientService,
          useValue: {
            getClient: async () => ({
              management: {
                contractDefinitions: { get: getDefinition },
                policyDefinitions: { get: getPolicy },
              },
            }),
          },
        },
        { provide: PartnerService, useValue: { getPartners } },
        { provide: CatalogService, useValue: { getAgreementsForFile: getAgreements } },
        { provide: TransferService, useValue: { getFileTransferHistory: getHistory } },
        { provide: FileSharingApiService, useValue: { downloadFile } },
        { provide: ModalAndAlertService, useValue: { showAlert } },
      ],
    });
  });

  async function create(
    overrides: Partial<FileAsset> = {},
  ): Promise<ComponentFixture<FileDetailComponent>> {
    const fixture = TestBed.createComponent(FileDetailComponent);
    fixture.componentRef.setInput('file', {
      id: 'file-1',
      name: 'report.txt',
      origin: 'owned',
      uploadedAt: '',
      assetId: 'asset-1',
      contractDefinitionId: 'consumer-share',
      ...overrides,
    } satisfies FileAsset);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function partnerNames(fixture: ComponentFixture<FileDetailComponent>): string[] {
    return [...fixture.nativeElement.querySelectorAll('[aria-label="Shared partners"] li')].map(
      (item) => (item as HTMLElement).textContent!.trim(),
    );
  }

  it('shows the linked definition, partner count and names from current policies', async () => {
    const fixture = await create();
    expect(getDefinition).toHaveBeenCalledOnceWith('consumer-share');
    expect(
      getPolicy.calls
        .allArgs()
        .map((args) => args[0])
        .sort(),
    ).toEqual(['access', 'contract']);
    expect(fixture.nativeElement.textContent).toContain('Contract definition');
    expect(fixture.nativeElement.textContent).toContain('consumer-share');
    expect(fixture.nativeElement.textContent).toContain('2 partners');
    expect(partnerNames(fixture)).toEqual(['Alice Ltd', 'Bob Ltd']);
    expect(fixture.nativeElement.textContent).not.toContain('did:web:alice');
    expect(
      fixture.componentInstance.agreementPartnerName(fixture.componentInstance.file, {
        providerId: 'provider',
        consumerId: 'did:web:bob',
      }),
    ).toBe('Bob Ltd');
  });

  it('applies both policies to the partner list', async () => {
    policies.set('contract', partnerPolicy('did:web:bob'));
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('1 partner');
    expect(partnerNames(fixture)).toEqual(['Bob Ltd']);
  });

  it('uses identifiers when partner names are unavailable', async () => {
    getPartners.and.resolveTo([]);
    expect(partnerNames(await create())).toEqual(['did:web:alice', 'did:web:bob']);
  });

  it('fetches a shared policy only once', async () => {
    definition.setValue('edc', 'contractPolicyId', 'access');
    await create();
    expect(getPolicy).toHaveBeenCalledOnceWith('access');
  });

  it('does not present unrestricted access as an empty sharing list', async () => {
    policies.set('access', openPolicy);
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('All partners');
    expect(fixture.nativeElement.textContent).not.toContain('Not shared with any partners.');
  });

  it('reports an empty audience when the policy restrictions do not overlap', async () => {
    policies.set('contract', partnerPolicy('did:web:other'));
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('0 partners');
    expect(partnerNames(fixture)).toEqual([]);
  });

  it('keeps agreements, history and downloads usable when a policy is unavailable', async () => {
    getPolicy.and.rejectWith(new Error('Policy unavailable'));
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Partner access unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('Not shared with any partners.');
    expect(getAgreements).toHaveBeenCalledOnceWith(fixture.componentInstance.file);
    expect(getHistory).toHaveBeenCalledOnceWith(fixture.componentInstance.file);
    expect(fixture.componentInstance.loadingAgreements).toBeFalse();
    expect(fixture.componentInstance.loadingTransferHistory).toBeFalse();
    expect(showAlert).not.toHaveBeenCalled();
    await fixture.componentInstance.download();
    expect(downloadFile).toHaveBeenCalledOnceWith(fixture.componentInstance.file);
  });

  it('keeps the stored definition visible when it cannot be loaded', async () => {
    getDefinition.and.rejectWith(new Error('Definition unavailable'));
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('consumer-share');
    expect(fixture.nativeElement.textContent).toContain('Partner access unavailable');
    expect(getPolicy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loadingSharing).toBeFalse();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('reports sharing as unavailable for files without a linked definition', async () => {
    const fixture = await create({ contractDefinitionId: undefined });
    expect(fixture.nativeElement.textContent).toContain('No contract definition linked.');
    expect(fixture.nativeElement.textContent).toContain('Partner access unavailable');
    expect(partnerNames(fixture)).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Not shared with any partners.');
    expect(getDefinition).not.toHaveBeenCalled();
    expect(getPolicy).not.toHaveBeenCalled();
  });

  it('leaves remote file details unchanged without loading provider definitions', async () => {
    const fixture = await create({ origin: 'remote', partnerName: 'Provider Ltd' });
    expect(fixture.nativeElement.textContent).toContain('Shared by');
    expect(fixture.nativeElement.textContent).toContain('Provider Ltd');
    expect(fixture.nativeElement.textContent).not.toContain('Contract definition');
    expect(fixture.nativeElement.textContent).not.toContain('Shared with');
    expect(getDefinition).not.toHaveBeenCalled();
    expect(getPolicy).not.toHaveBeenCalled();
    expect(getPartners).not.toHaveBeenCalled();
  });
});
