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
import { FileSharingFileResource } from '../../models/file-sharing-data.model';
import { FileSharingApiService } from '../../services/file-sharing-api.service';
import { FileDetailComponent } from '../file-detail/file-detail.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { asNumber, asString } from '../../utils/cast.utils';
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

  files: FileAsset[] = [];
  filteredFiles: FileAsset[] = [];
  pageFiles: FileAsset[] = [];

  readonly DATE_FORMATS = DATE_FORMATS;
  readonly formatFileSize = formatFileSize;

  loading = true;
  pageItemCount = 10;
  searchText = '';

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
      const files = await this.fileSharing.listFiles();
      const mappedFiles = files
        .map(file => this.mapFileSharingResource(file))
        .sort((a, b) => a.name.localeCompare(b.name));

      this.files = mappedFiles;
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

  private mapFileSharingResource(file: FileSharingFileResource): FileAsset {
    const metadata = file.metadata ?? {};
    const uploadedAt =
      typeof file.uploadTimestamp === 'number' && Number.isFinite(file.uploadTimestamp)
        ? new Date(file.uploadTimestamp).toISOString()
        : '';

    return {
      id: file.id ?? '',
      name:
        file.fileName ?? asString(metadata['fileName']) ?? asString(metadata['name']) ?? file.id ?? '',
      type: file.contentType ?? asString(metadata['contentType']) ?? '',
      size: asNumber(metadata['size']) ?? file.contentLength ?? 0,
      uploadedAt,
      origin: 'owned',
    };
  }

  private showError(error: unknown, title: string): void {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    this.modalAndAlert.showAlert(message, title, 'error', 8);
  }
}
