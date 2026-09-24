import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  FilterInputComponent,
  ItemCountSelectorComponent,
  ModalAndAlertService,
  PaginationComponent,
} from '@eclipse-edc/dashboard-core';

import { FileAsset } from '../../models/file-asset.model';
import { FileSharingApiService } from '../../services/file-sharing-api.service';
import { FilesService } from '../../services/files.service';
import { TransferService } from '../../services/transfer.service';
import { FileDetailComponent } from '../file-detail/file-detail.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { DATE_FORMATS, formatFileSize } from '../../utils/format.utils';

@Component({
  selector: 'participant-files-list',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FilterInputComponent,
    ItemCountSelectorComponent,
    PaginationComponent,
  ],
  templateUrl: './files-list.component.html',
})
export class FilesListComponent {
  private readonly router = inject(Router);
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly fileSharing = inject(FileSharingApiService);
  private readonly filesService = inject(FilesService);
  private readonly transferService = inject(TransferService);

  files: FileAsset[] = [];
  filteredFiles: FileAsset[] = [];
  pageFiles: FileAsset[] = [];

  readonly DATE_FORMATS = DATE_FORMATS;
  readonly formatFileSize = formatFileSize;

  loading = true;
  pageItemCount = 10;
  searchText = '';
  downloadingId: string | null = null;

  constructor() {
    void this.loadData();
  }

  filter(searchText: string): void {
    this.searchText = searchText.trim().toLowerCase();
    this.applyFilters();
  }

  paginationEvent(pageItems: FileAsset[]): void {
    this.pageFiles = pageItems;
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const files = await this.filesService.getFilesForFilesView();
      this.files = files;
      this.applyFilters();
    } catch (error) {
      this.showError(error, 'Failed to load files');
      this.files = [];
      this.filteredFiles = [];
      this.pageFiles = [];
    } finally {
      this.loading = false;
    }
  }

  openUpload(): void {
    this.modalAndAlert.openModal(
      FileUploadComponent,
      {},
      {
        cancel: () => this.modalAndAlert.closeModal(),
        uploaded: (count: number) => {
          this.modalAndAlert.closeModal();
          this.modalAndAlert.showAlert(
            `Uploaded ${count} file(s) successfully.`,
            'Upload complete',
            'success',
            6,
          );
          void this.loadData();
        },
      },
      true,
    );
  }

  openExplore(): void {
    void this.router.navigate(['/explore']);
  }

  openDetails(file: FileAsset): void {
    if (!file.id) {
      return;
    }
    this.modalAndAlert.openModal(
      FileDetailComponent,
      { file },
      undefined,
      true,
    );
  }

  async download(file: FileAsset): Promise<void> {
    this.downloadingId = file.id;
    try {
      if (file.origin === 'owned') {
        await this.fileSharing.downloadFile(file);
      } else {
        await this.transferService.requestTransferAndDownload(file);
      }
      this.modalAndAlert.showAlert(
        `Started download for "${file.name}".`,
        'Download',
        'success',
        5,
      );
    } catch (error) {
      this.showError(error, 'Download failed');
    } finally {
      this.downloadingId = null;
    }
  }

  private applyFilters(): void {
    let next = [...this.files];

    if (this.searchText) {
      next = next.filter(file => {
        const fields = [file.id, file.name, file.type]
          .filter((field): field is string => typeof field === 'string')
          .map(field => field.toLowerCase());

        return fields.some(field => field.includes(this.searchText));
      });
    }

    this.filteredFiles = next;
  }

  private showError(error: unknown, title: string): void {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    this.modalAndAlert.showAlert(message, title, 'error', 8);
  }
}
