import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { FileAsset } from '../../models/file-asset.model';
import { UseCase } from '../../models/redline-data.model';
import { FilesService } from '../../services/files.service';
import { TransferService } from '../../services/transfer.service';
import { UseCaseService } from '../../services/use-case.service';
import { DATE_FORMATS, formatFileSize } from '../../utils/format.utils';

@Component({
  selector: 'participant-files-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, TitleCasePipe],
  templateUrl: './files-list.component.html',
})
export class FilesListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly filesService = inject(FilesService);
  private readonly transferService = inject(TransferService);
  private readonly useCaseService = inject(UseCaseService);

  readonly filterForm = this.fb.nonNullable.group({
    searchTerm: [''],
    useCaseFilter: [''],
    originFilter: [''],
  });

  readonly DATE_FORMATS = DATE_FORMATS;
  readonly formatFileSize = formatFileSize;

  files: FileAsset[] = [];
  filteredFiles: FileAsset[] = [];
  useCases: UseCase[] = [];

  loading = true;
  requestingTransferId: string | null = null;
  searchText = '';
  useCaseFilter = '';
  originFilter = '';
  currentPage = 1;
  pageSize = 10;

  constructor() {
    this.setupFilterListeners();
    void this.loadData();
  }

  get pagedFiles(): FileAsset[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredFiles.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredFiles.length / this.pageSize));
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [files, useCases] = await Promise.all([
        this.filesService.getFilesForFilesView(),
        this.useCaseService.getUseCases(),
      ]);
      this.files = files;
      this.useCases = useCases;
      this.applyFilters();
    } catch (error) {
      this.showError(error, 'Failed to load files');
      this.files = [];
      this.filteredFiles = [];
    } finally {
      this.loading = false;
    }
  }

  async requestTransferAndDownload(file: FileAsset): Promise<void> {
    this.requestingTransferId = file.id;
    try {
      await this.transferService.requestTransferAndDownload(file);
      this.modalAndAlert.showAlert(
        `Started download for "${file.name}".`,
        'Download',
        'success',
        5,
      );
    } catch (error) {
      this.showError(error, 'Download failed');
    } finally {
      this.requestingTransferId = null;
    }
  }

  openUpload(): void {
    void this.router.navigate(['/files/upload']);
  }

  openExplore(): void {
    void this.router.navigate(['/explore']);
  }

  openDetails(file: FileAsset): void {
    if (!file.id) {
      return;
    }
    void this.router.navigate(['/files', file.id]);
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage -= 1;
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage += 1;
    }
  }

  private setupFilterListeners(): void {
    this.filterForm.controls.searchTerm.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.searchText = value.trim().toLowerCase();
        this.applyFilters();
      });

    this.filterForm.controls.useCaseFilter.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.useCaseFilter = value;
        this.applyFilters();
      });

    this.filterForm.controls.originFilter.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.originFilter = value;
        this.applyFilters();
      });
  }

  private applyFilters(): void {
    let next = [...this.files];

    if (this.searchText) {
      next = next.filter(file => {
        const fields = [
          file.name,
          file.type,
          file.useCase,
          file.useCaseLabel,
          file.origin,
          file.partnerName,
        ]
          .filter((field): field is string => typeof field === 'string')
          .map(field => field.toLowerCase());

        return fields.some(field => field.includes(this.searchText));
      });
    }

    if (this.useCaseFilter) {
      next = next.filter(file => file.useCase === this.useCaseFilter);
    }

    if (this.originFilter) {
      next = next.filter(file => file.origin === this.originFilter);
    }

    this.filteredFiles = next;
    this.currentPage = Math.min(this.currentPage, this.totalPages);
    if (this.currentPage === 0) {
      this.currentPage = 1;
    }
  }

  private showError(error: unknown, title: string): void {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    this.modalAndAlert.showAlert(message, title, 'error', 8);
  }
}
