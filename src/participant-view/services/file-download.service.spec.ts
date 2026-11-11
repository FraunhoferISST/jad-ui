import { TestBed } from '@angular/core/testing';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { FileAsset } from '../models/file-asset.model';
import { FileDownloadService } from './file-download.service';
import { FileSharingApiService } from './file-sharing-api.service';
import { TransferService } from './transfer.service';

describe('FileDownloadService', () => {
  let downloads: FileDownloadService;
  let sharing: jasmine.SpyObj<FileSharingApiService>;
  let transfers: jasmine.SpyObj<TransferService>;
  let alerts: jasmine.SpyObj<ModalAndAlertService>;
  const file: FileAsset = { id: '1', name: 'file.txt', origin: 'owned', uploadedAt: 0 };

  beforeEach(() => {
    sharing = jasmine.createSpyObj('FileSharingApiService', ['downloadFile']);
    transfers = jasmine.createSpyObj('TransferService', ['requestTransferAndDownload']);
    alerts = jasmine.createSpyObj('ModalAndAlertService', ['showAlert']);
    sharing.downloadFile.and.resolveTo();
    transfers.requestTransferAndDownload.and.resolveTo();
    TestBed.configureTestingModule({
      providers: [
        { provide: FileSharingApiService, useValue: sharing },
        { provide: TransferService, useValue: transfers },
        { provide: ModalAndAlertService, useValue: alerts },
      ],
    });
    downloads = TestBed.inject(FileDownloadService);
  });

  it('uses file-sharing for owned files and transfer for remote files', async () => {
    await downloads.download(file);
    expect(sharing.downloadFile).toHaveBeenCalledOnceWith(file);
    expect(transfers.requestTransferAndDownload).not.toHaveBeenCalled();
    const remote: FileAsset = { ...file, origin: 'remote' };
    await downloads.download(remote);
    expect(transfers.requestTransferAndDownload).toHaveBeenCalledOnceWith(remote);
    expect(alerts.showAlert).toHaveBeenCalledTimes(2);
    expect(alerts.showAlert).toHaveBeenCalledWith(
      'Started download for "file.txt".',
      'Download',
      'success',
      5,
    );
  });

  it('does not report success when the download fails', async () => {
    sharing.downloadFile.and.rejectWith(new Error('unavailable'));
    await expectAsync(downloads.download(file)).toBeRejectedWithError('unavailable');
    expect(alerts.showAlert).not.toHaveBeenCalled();
  });
});
