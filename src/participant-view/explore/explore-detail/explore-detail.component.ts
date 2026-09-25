import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { FileAsset } from '../../models/file-asset.model';
import { CatalogService } from '../../services/catalog.service';
import { TransferService } from '../../services/transfer.service';
import { DATE_FORMATS, formatFileSize } from '../../utils/format.utils';

@Component({
  selector: 'participant-explore-detail',
  standalone: true,
  imports: [CommonModule, DatePipe, TitleCasePipe],
  templateUrl: './explore-detail.component.html',
})
export class ExploreDetailComponent implements OnChanges {
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly catalogService = inject(CatalogService);
  private readonly transferService = inject(TransferService);

  @Input({ required: true }) file!: FileAsset;

  readonly DATE_FORMATS = DATE_FORMATS;
  readonly formatFileSize = formatFileSize;

  loadingAgreements = true;
  loadingTransferHistory = true;
  requestingAccess = false;
  requestingTransfer = false;

  hasAccess(): boolean {
    return (this.file.agreements?.length ?? 0) > 0;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['file']) {
      this.loadingAgreements = true;
      this.loadingTransferHistory = true;
      void this.loadAgreements();
      void this.loadTransferHistory();
    }
  }

  agreementPartnerName(
    file: FileAsset,
    agreement: { providerId: string; consumerId: string },
  ): string {
    return file.partnerName || agreement.providerId || 'N/A';
  }

  agreementDate(epochSeconds: number): number {
    return epochSeconds * 1000;
  }

  async requestAccess(): Promise<void> {
    this.requestingAccess = true;
    try {
      await this.catalogService.requestAccess(this.file);
      this.modalAndAlert.showAlert('Access granted successfully.', 'Access request', 'success', 5);
      this.loadingAgreements = true;
      await this.loadAgreements();
    } catch (error) {
      this.showError(error, 'Access request failed');
    } finally {
      this.requestingAccess = false;
    }
  }

  async download(): Promise<void> {
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
