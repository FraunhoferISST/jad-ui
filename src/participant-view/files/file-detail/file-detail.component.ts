import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject, Input, OnInit } from '@angular/core';
import { EdcClientService, ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { FileAsset } from '../../models/file-asset.model';
import { CatalogService } from '../../services/catalog.service';
import { ContractSharingService } from '../../services/contract-sharing.service';
import { FileSharingApiService } from '../../services/file-sharing-api.service';
import { TransferService } from '../../services/transfer.service';
import { DATE_FORMATS, formatFileSize } from '../../utils/format.utils';
import { ContractSharing } from '../../utils/contract-sharing';

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
  private readonly fileSharing = inject(FileSharingApiService);
  private readonly edcClientService = inject(EdcClientService);
  private readonly sharingService = inject(ContractSharingService);

  @Input({ required: true }) file!: FileAsset;

  readonly DATE_FORMATS = DATE_FORMATS;
  readonly formatFileSize = formatFileSize;

  contractSharing?: ContractSharing;
  loadingSharing = true;
  loadingAgreements = true;
  loadingTransferHistory = true;
  requestingTransfer = false;

  async download(): Promise<void> {
    if (!this.file) {
      return;
    }
    this.requestingTransfer = true;
    try {
      if (this.file.origin === 'owned') {
        await this.fileSharing.downloadFile(this.file);
      } else {
        await this.transferService.requestTransferAndDownload(this.file);
      }
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
    if (file.origin !== 'owned') {
      return file.partnerName || file.partnerDid || 'N/A';
    }
    const partnerId = agreement.consumerId;
    const partner = this.contractSharing?.partners.find((item) => item.identifier === partnerId);
    return partner?.nickname || partnerId || 'N/A';
  }

  agreementDate(epochSeconds: number): number {
    return epochSeconds * 1000;
  }

  async ngOnInit(): Promise<void> {
    const sharing = this.loadSharing();
    await this.loadAgreements();
    await Promise.all([this.loadTransferHistory(), sharing]);
  }

  private async loadSharing(): Promise<void> {
    try {
      if (this.file.origin !== 'owned' || !this.file.contractDefinitionId) return;
      const client = await this.edcClientService.getClient();
      const definition = await client.management.contractDefinitions.get(
        this.file.contractDefinitionId,
      );
      const sharing = await this.sharingService.getSharing([definition]);
      this.contractSharing = sharing.get(definition.id);
    } catch {
      // Keep the remaining file details usable if its definition cannot be loaded.
      this.contractSharing = undefined;
    } finally {
      this.loadingSharing = false;
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
