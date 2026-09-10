import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { FileAsset } from '../../models/file-asset.model';
import { CatalogService } from '../../services/catalog.service';
import { FilesService } from '../../services/files.service';
import { TransferService } from '../../services/transfer.service';
import { formatFileSize } from '../../utils/format.utils';

@Component({
  selector: 'participant-explore-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './explore-detail.component.html',
})
export class ExploreDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly filesService = inject(FilesService);
  private readonly catalogService = inject(CatalogService);
  private readonly transferService = inject(TransferService);

  readonly formatFileSize = formatFileSize;

  file: FileAsset | null = null;
  loading = true;
  requestingAccess = false;
  requestingTransfer = false;

  constructor() {
    void this.load();
  }

  hasAccess(file: FileAsset): boolean {
    return (file.agreements?.length ?? 0) > 0;
  }

  back(): void {
    void this.router.navigate(['/explore']);
  }

  async requestAccess(): Promise<void> {
    if (!this.file) {
      return;
    }

    this.requestingAccess = true;
    try {
      await this.catalogService.requestAccess(this.file);
      this.modalAndAlert.showAlert('Access granted successfully.', 'Access request', 'success', 5);
      await this.load();
    } catch (error) {
      this.showError(error, 'Access request failed');
    } finally {
      this.requestingAccess = false;
    }
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

  private async load(): Promise<void> {
    this.loading = true;
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading = false;
      return;
    }

    try {
      const files = await this.filesService.getFilesForExploreView();
      this.file = files.find(item => item.id === id) ?? null;
    } catch (error) {
      this.file = null;
      this.showError(error, 'Failed to load file details');
    } finally {
      this.loading = false;
    }
  }

  private showError(error: unknown, title: string): void {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    this.modalAndAlert.showAlert(message, title, 'error', 8);
  }
}
