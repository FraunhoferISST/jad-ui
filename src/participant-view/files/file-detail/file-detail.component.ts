import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { FileAsset } from '../../models/file-asset.model';
import { FilesService } from '../../services/files.service';
import { TransferService } from '../../services/transfer.service';
import { DATE_FORMATS, formatFileSize } from '../../utils/format.utils';

@Component({
  selector: 'participant-file-detail',
  standalone: true,
  imports: [CommonModule, DatePipe, TitleCasePipe],
  templateUrl: './file-detail.component.html',
})
export class FileDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly filesService = inject(FilesService);
  private readonly transferService = inject(TransferService);

  readonly DATE_FORMATS = DATE_FORMATS;
  readonly formatFileSize = formatFileSize;

  file: FileAsset | null = null;
  loading = true;
  requestingTransfer = false;

  constructor() {
    void this.load();
  }

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

  back(): void {
    void this.router.navigate(['/files']);
  }

  private async load(): Promise<void> {
    this.loading = true;
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading = false;
      return;
    }

    try {
      const files = await this.filesService.getFilesForFilesView();
      const file = files.find(item => item.id === id);
      if (!file) {
        this.file = null;
        return;
      }

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
