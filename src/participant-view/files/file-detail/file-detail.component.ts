import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { FileAsset } from '../../models/file-asset.model';
import { CatalogService } from '../../services/catalog.service';
import { FilesService } from '../../services/files.service';
import { TransferService } from '../../services/transfer.service';
import { DATE_FORMATS, formatFileSize } from '../../utils/format.utils';

@Component({
  selector: 'participant-file-detail',
  standalone: true,
  imports: [CommonModule, DatePipe, TitleCasePipe],
  templateUrl: './file-detail.component.html',
})
export class FileDetailComponent implements OnChanges {
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly filesService = inject(FilesService);
  private readonly transferService = inject(TransferService);
  private readonly catalogService = inject(CatalogService);

  @Input() fileId = '';

  readonly DATE_FORMATS = DATE_FORMATS;
  readonly formatFileSize = formatFileSize;

  file: FileAsset | null = null;
  loading = true;
  requestingTransfer = false;

  async download(): Promise<void> {
    if (!this.file) {
      return;
    }
    this.requestingTransfer = true;
    try {
      await this.transferService.requestTransferAndDownload(this.file);
      this.modalAndAlert.showAlert(
        `Started download for "${this.file.name}".`,
        'Download',
        'success',
        5,
      );
    } catch (error) {
      this.showError(error, 'Download failed');
    } finally {
      this.requestingTransfer = false;
    }
  }

  agreementPartnerName(file: FileAsset, agreement: { providerId: string; consumerId: string }): string {
    const partnerId = file.origin === 'owned' ? agreement.consumerId : agreement.providerId;
    const restriction = (file.accessRestrictions ?? []).find(item => item.partnerId === partnerId);
    return restriction?.partnerName || partnerId || 'N/A';
  }

  agreementDate(epochSeconds: number): number {
    return epochSeconds * 1000;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fileId'] && this.fileId) {
      void this.load();
    }
  }

  private async load(): Promise<void> {
    this.loading = true;
    if (!this.fileId) {
      this.loading = false;
      return;
    }

    try {
      const files = await this.filesService.getFilesForFilesView();
      const file = files.find(item => item.id === this.fileId);
      if (!file) {
        this.file = null;
        return;
      }

      file.agreements = await this.catalogService.getAgreementsForFile(file);
      file.transactionHistory = await this.transferService.getFileTransferHistory(file);
      this.file = file;
    } catch (error) {
      this.showError(error, 'Failed to load file details');
      this.file = null;
    } finally {
      this.loading = false;
    }
  }

  private showError(error: unknown, title: string): void {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    this.modalAndAlert.showAlert(message, title, 'error', 8);
  }
}
