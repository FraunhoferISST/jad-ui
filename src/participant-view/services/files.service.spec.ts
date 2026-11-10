import { TestBed } from '@angular/core/testing';

import { FileAsset } from '../models/file-asset.model';
import { CatalogService } from './catalog.service';
import { FileSharingApiService } from './file-sharing-api.service';
import { FilesService } from './files.service';

describe('FilesService owned file metadata', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FileSharingApiService,
          useValue: {
            listFiles: async () => [
              {
                id: 'linked',
                fileName: 'report.txt',
                metadata: {
                  assetId: 'asset-1',
                  contractDefinitionId: 'consumer-share',
                },
              },
              {
                id: 'legacy',
                fileName: 'legacy.txt',
                metadata: { partnerIds: ['did:web:former'] },
              },
              { id: 'invalid', fileName: 'invalid.txt', metadata: { contractDefinitionId: 123 } },
            ],
          },
        },
        {
          provide: CatalogService,
          useValue: {
            getCatalogForAllPartners: async () => [],
            matchContractsToFiles: async (files: FileAsset[]) => files,
          },
        },
      ],
    });
  });

  for (const method of ['getOwnedFiles', 'getFilesForFilesView'] as const) {
    it(`retains the uploaded contract definition in ${method}`, async () => {
      const files = await TestBed.inject(FilesService)[method]();
      expect(files.find((file) => file.id === 'linked')).toEqual(
        jasmine.objectContaining({
          contractDefinitionId: 'consumer-share',
          assetId: 'asset-1',
          origin: 'owned',
        }),
      );
      expect(files.find((file) => file.id === 'legacy')).toEqual({
        id: 'legacy',
        name: 'legacy.txt',
        type: undefined,
        uploadedAt: '',
        size: 0,
        origin: 'owned',
        assetId: undefined,
        contractDefinitionId: undefined,
      });
      expect(files.find((file) => file.id === 'invalid')?.contractDefinitionId).toBeUndefined();
    });
  }
});
