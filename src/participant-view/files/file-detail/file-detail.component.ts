import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject, Input, OnInit } from '@angular/core';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { FileAsset } from '../../models/file-asset.model';
import { CatalogService } from '../../services/catalog.service';
import { TransferService } from '../../services/transfer.service';
import { DATE_FORMATS, formatFileSize } from '../../utils/format.utils';

@Component({
  selector: 'participant-file-detail',
  standalone: true,
  imports: [CommonModule, DatePipe, TitleCasePipe],
  templateUrl: './file-detail.component.html',
})
export class FileDetailComponent implements OnInit {
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly transferService = inject(TransferService);
  private readonly catalogService = inject(CatalogService);

  @Input({ required: true }) file!: FileAsset;

  readonly DATE_FORMATS = DATE_FORMATS;
  readonly formatFileSize = formatFileSize;

  loadingAgreements = true;
  loadingTransferHistory = true;
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

  agreementPartnerName(
    file: FileAsset,
    agreement: { providerId: string; consumerId: string },
  ): string {
    const partnerId = file.origin === 'owned' ? agreement.consumerId : agreement.providerId;
    const restriction = (file.accessRestrictions ?? []).find(
      (item) => item.partnerId === partnerId,
    );
    return restriction?.partnerName || partnerId || 'N/A';
  }

  agreementDate(epochSeconds: number): number {
    return epochSeconds * 1000;
  }

  async ngOnInit() {
    await this.loadAgreements();
    await this.loadTransferHistory();
  }

  private async loadAgreements(): Promise<void> {
    try {
      this.file.agreements = await this.catalogService.getAgreementsForFile(this.file);
    } catch (error) {
      this.showError(error, 'Failed to load agreements');
      this.file.agreements = [];
    } finally {
      this.loadingAgreements = false;
    }
  }

  private async loadTransferHistory(): Promise<void> {
    try {
      this.file.transactionHistory = await this.transferService.getFileTransferHistory(this.file);
    } catch (error) {
      this.showError(error, 'Failed to load transfer history');
      this.file.transactionHistory = [];
    } finally {
      this.loadingTransferHistory = false;
    }
  }

  private showError(error: unknown, title: string): void {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    this.modalAndAlert.showAlert(message, title, 'error', 8);
  }
}
