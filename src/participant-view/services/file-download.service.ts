import { inject, Injectable } from '@angular/core';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { FileAsset } from '../models/file-asset.model';
import { FileSharingApiService } from './file-sharing-api.service';
import { TransferService } from './transfer.service';

/** Select the correct download route and report successful initiation. */
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  private readonly fileSharing = inject(FileSharingApiService);
  private readonly transfers = inject(TransferService);
  private readonly alerts = inject(ModalAndAlertService);

  async download(file: FileAsset): Promise<void> {
    if (file.origin === 'owned') await this.fileSharing.downloadFile(file);
    else await this.transfers.requestTransferAndDownload(file);
    this.alerts.showAlert(`Started download for "${file.name}".`, 'Download', 'success', 5);
  }
}
