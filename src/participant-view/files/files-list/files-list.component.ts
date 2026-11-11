import { DatePipe, TitleCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FilterInputComponent,
  ItemCountSelectorComponent,
  ModalAndAlertService,
  PaginationComponent,
} from '@eclipse-edc/dashboard-core';
import { FileAsset } from '../../models/file-asset.model';
import { FileDownloadService } from '../../services/file-download.service';
import { FilesService } from '../../services/files.service';
import { FileDetailComponent } from '../file-detail/file-detail.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { DATE_FORMATS, formatFileSize } from '../../utils/format.utils';
import { showError } from '../../../app/utils/show-error';

@Component({
  selector: 'app-participant-files-list',
  imports: [
    DatePipe,
    TitleCasePipe,
    FilterInputComponent,
    ItemCountSelectorComponent,
    PaginationComponent,
  ],
  templateUrl: './files-list.component.html',
})
export class FilesListComponent {
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly downloads = inject(FileDownloadService);
  private readonly filesService = inject(FilesService);

  readonly files = signal<FileAsset[]>([]);
  readonly pageFiles = signal<FileAsset[]>([]);
  readonly loading = signal(true);
  readonly pageItemCount = signal(10);
  readonly searchText = signal('');
  readonly downloadingId = signal<string | null>(null);
  readonly DATE_FORMATS = DATE_FORMATS;
  readonly formatFileSize = formatFileSize;
  readonly filteredFiles = computed(() => {
    const query = this.searchText();
    return this.files().filter(
      (file) =>
        !query ||
        [file.id, file.name, file.type].some((field) => field?.toLowerCase().includes(query)),
    );
  });

  constructor() {
    void this.loadData();
  }

  filter(searchText: string): void {
    this.searchText.set(searchText.trim().toLowerCase());
  }
  paginationEvent(pageItems: FileAsset[]): void {
    this.pageFiles.set(pageItems);
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      this.files.set(await this.filesService.getFilesForFilesView());
    } catch (error) {
      showError(this.modalAndAlert, error, 'Failed to load files');
      this.files.set([]);
      this.pageFiles.set([]);
    } finally {
      this.loading.set(false);
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

  openDetails(file: FileAsset): void {
    this.modalAndAlert.openModal(FileDetailComponent, { file }, undefined, true);
  }

  async download(file: FileAsset): Promise<void> {
    this.downloadingId.set(file.id);
    try {
      await this.downloads.download(file);
    } catch (error) {
      showError(this.modalAndAlert, error, 'Download failed');
    } finally {
      this.downloadingId.set(null);
    }
  }
}
