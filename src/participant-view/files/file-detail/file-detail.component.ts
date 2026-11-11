import { TitleCasePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { EdcClientService, ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { FileActivityComponent } from '../../file-activity/file-activity.component';
import { FileAsset } from '../../models/file-asset.model';
import { ContractSharingService } from '../../services/contract-sharing.service';
import { FileDownloadService } from '../../services/file-download.service';
import { formatFileSize } from '../../utils/format.utils';
import { ContractSharing } from '../../utils/contract-sharing';
import { showError } from '../../../app/utils/show-error';

@Component({
  selector: 'app-participant-file-detail',
  imports: [TitleCasePipe, FileActivityComponent],
  templateUrl: './file-detail.component.html',
})
export class FileDetailComponent implements OnInit {
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly downloads = inject(FileDownloadService);
  private readonly edcClientService = inject(EdcClientService);
  private readonly sharingService = inject(ContractSharingService);

  readonly file = input.required<FileAsset>();
  readonly formatFileSize = formatFileSize;
  readonly contractSharing = signal<ContractSharing | undefined>(undefined);
  readonly loadingSharing = signal(true);
  readonly requestingTransfer = signal(false);

  async download(): Promise<void> {
    this.requestingTransfer.set(true);
    try {
      await this.downloads.download(this.file());
    } catch (error) {
      showError(this.modalAndAlert, error, 'Download failed');
    } finally {
      this.requestingTransfer.set(false);
    }
  }

  async ngOnInit(): Promise<void> {
    const file = this.file();
    try {
      if (file.origin !== 'owned' || !file.contractDefinitionId) return;
      const client = await this.edcClientService.getClient();
      const definition = await client.management.contractDefinitions.get(file.contractDefinitionId);
      const sharing = await this.sharingService.getSharing([definition]);
      this.contractSharing.set(sharing.get(definition.id));
    } catch {
      // Keep other file details usable if the definition cannot be loaded.
      this.contractSharing.set(undefined);
    } finally {
      this.loadingSharing.set(false);
    }
  }
}
