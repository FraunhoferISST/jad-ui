import { TestBed } from '@angular/core/testing';
import { EdcClientService } from '@eclipse-edc/dashboard-core';
import { FileSharingApiService } from './file-sharing-api.service';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let fileSharing: jasmine.SpyObj<FileSharingApiService>;
  let definitions: {
    get: jasmine.Spy;
    update: jasmine.Spy;
    delete: jasmine.Spy;
  };
  let assets: { create: jasmine.Spy; delete: jasmine.Spy };

  const definition = {
    id: 'shared-definition',
    accessPolicyId: 'access-policy',
    contractPolicyId: 'contract-policy',
    assetsSelector: [
      { operandLeft: 'id', operator: '=', operandRight: 'existing-asset' },
      { operandLeft: 'https://example.org/type', operator: '=', operandRight: 'file' },
    ],
  };

  beforeEach(() => {
    fileSharing = jasmine.createSpyObj<FileSharingApiService>('FileSharingApiService', [
      'uploadFile', 'listFiles', 'deleteFile',
    ]);
    fileSharing.uploadFile.and.resolveTo();
    fileSharing.listFiles.and.callFake(async () => {
      const form = fileSharing.uploadFile.calls.mostRecent().args[0];
      const metadata = JSON.parse(form.get('metadata') as string) as Record<string, unknown>;
      return [{ id: 'stored-file', metadata }];
    });
    fileSharing.deleteFile.and.resolveTo();

    definitions = {
      get: jasmine.createSpy('get').and.resolveTo(definition),
      update: jasmine.createSpy('update').and.resolveTo(),
      delete: jasmine.createSpy('delete'),
    };
    assets = {
      create: jasmine.createSpy('create').and.resolveTo(),
      delete: jasmine.createSpy('delete').and.resolveTo(),
    };
    TestBed.configureTestingModule({
      providers: [
        UploadService,
        { provide: FileSharingApiService, useValue: fileSharing },
        { provide: EdcClientService, useValue: {
          getClient: async () => ({ management: { contractDefinitions: definitions, assets } }),
        } },
      ],
    });
    service = TestBed.inject(UploadService);
  });

  it('preserves the selected definition policies and selector while adding the uploaded asset', async () => {
    await service.uploadFile(new File(['hello'], 'report.txt'), definition.id);

    const assetId = assets.create.calls.mostRecent().args[0]['@id'] as string;
    expect(definitions.get).toHaveBeenCalledTimes(2);
    expect(definitions.update).toHaveBeenCalledOnceWith({
      '@type': 'ContractDefinition',
      '@id': definition.id,
      accessPolicyId: definition.accessPolicyId,
      contractPolicyId: definition.contractPolicyId,
      assetsSelector: [
        { '@type': 'Criterion', ...definition.assetsSelector[0] },
        { '@type': 'Criterion', ...definition.assetsSelector[1] },
        { '@type': 'Criterion', operandLeft: 'id', operator: '=', operandRight: assetId },
      ],
    });
    expect(definitions.delete).not.toHaveBeenCalled();
  });

  it('removes the newly created asset and file if the selector update fails', async () => {
    definitions.update.and.rejectWith(new Error('update failed'));

    await expectAsync(service.uploadFile(new File(['hello'], 'report.txt'), definition.id))
      .toBeRejectedWithError('update failed');

    expect(assets.delete).toHaveBeenCalledWith(assets.create.calls.mostRecent().args[0]['@id']);
    expect(fileSharing.deleteFile).toHaveBeenCalledWith('stored-file');
    expect(definitions.delete).not.toHaveBeenCalled();
  });

  it('keeps the asset and file if a failed update may have referenced them', async () => {
    definitions.update.and.rejectWith(new Error('response lost'));
    definitions.get.and.callFake(async () => {
      if (!assets.create.calls.any()) {
        return definition;
      }
      return {
        ...definition,
        assetsSelector: [
          ...definition.assetsSelector,
          { operandLeft: 'id', operator: '=', operandRight: assets.create.calls.mostRecent().args[0]['@id'] },
        ],
      };
    });

    await expectAsync(service.uploadFile(new File(['hello'], 'report.txt'), definition.id))
      .toBeRejectedWithError('response lost');

    expect(assets.delete).not.toHaveBeenCalled();
    expect(fileSharing.deleteFile).not.toHaveBeenCalled();
  });

  it('does not store a file if the selected definition is unavailable', async () => {
    definitions.get.and.rejectWith(new Error('missing definition'));

    await expectAsync(service.uploadFile(new File(['hello'], 'report.txt'), definition.id))
      .toBeRejectedWithError('missing definition');

    expect(fileSharing.uploadFile).not.toHaveBeenCalled();
    expect(assets.create).not.toHaveBeenCalled();
  });
});
