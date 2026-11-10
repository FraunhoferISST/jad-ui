import { TestBed } from '@angular/core/testing';
import { EdcClientService } from '@eclipse-edc/dashboard-core';
import { ContractAgreement } from '@think-it-labs/edc-connector-client';

import { FileAsset } from '../models/file-asset.model';
import { CatalogService } from './catalog.service';
import { PartnerService } from './partner.service';

describe('CatalogService file agreements', () => {
  let service: CatalogService;
  let queryAll: jasmine.Spy;
  const agreement = (id: string, assetId: string, consumerId: string): ContractAgreement => {
    const result = new ContractAgreement();
    result.id = id;
    result.setValue('edc', 'assetId', assetId);
    result.setValue('edc', 'consumerId', consumerId);
    return result;
  };
  const file = (origin: FileAsset['origin']): FileAsset => ({
    id: 'file-1',
    name: 'report.txt',
    uploadedAt: '',
    origin,
    assetId: 'asset-1',
    contractDefinitionId: 'current-sharing',
  });

  beforeEach(() => {
    queryAll = jasmine.createSpy('queryAll').and.resolveTo([]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: EdcClientService,
          useValue: {
            getClient: async () => ({ v5contractAgreements: { queryAll } }),
          },
        },
        { provide: PartnerService, useValue: {} },
      ],
    });
    service = TestBed.inject(CatalogService);
  });

  for (const origin of ['owned', 'remote'] as const) {
    it(`queries ${origin} agreements by asset ID without restricting their partners`, async () => {
      const agreements = [
        agreement('first', 'asset-1', 'current'),
        agreement('historical', 'asset-1', 'former'),
      ];
      queryAll.and.resolveTo(agreements);
      expect(await service.getAgreementsForFile(file(origin))).toEqual(agreements);
      expect(queryAll).toHaveBeenCalledOnceWith({
        '@type': 'QuerySpec',
        filterExpression: [
          { '@type': 'Criterion', operandLeft: 'assetId', operator: '=', operandRight: 'asset-1' },
        ],
      });
    });
  }

  it('does not request every agreement when the file has no asset ID', async () => {
    expect(await service.getAgreementsForFile({ ...file('owned'), assetId: undefined })).toEqual(
      [],
    );
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('matches all agreed partners to files by asset ID without a directory lookup', async () => {
    const first = agreement('first', 'asset-1', 'current');
    const historical = agreement('historical', 'asset-1', 'former');
    queryAll.and.resolveTo([first, historical, agreement('unrelated', 'asset-other', 'other')]);
    const files = [file('owned'), { ...file('remote'), assetId: 'asset-2' }];
    await service.matchContractsToFiles(files);
    expect(files[0].agreements).toEqual([first, historical]);
    expect(files[1].agreements).toBeUndefined();
  });
});
