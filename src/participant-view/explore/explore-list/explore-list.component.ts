import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { FileAsset } from '../../models/file-asset.model';
import { PartnerReference } from '../../models/redline-data.model';
import { CatalogService } from '../../services/catalog.service';
import { FilesService } from '../../services/files.service';
import { PartnerService } from '../../services/partner.service';
import { TransferService } from '../../services/transfer.service';

@Component({
  selector: 'participant-explore-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './explore-list.component.html',
})
export class ExploreListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly filesService = inject(FilesService);
  private readonly partnerService = inject(PartnerService);
  private readonly catalogService = inject(CatalogService);
  private readonly transferService = inject(TransferService);

  readonly filterForm = this.fb.nonNullable.group({
    searchTerm: [''],
    companyFilter: [''],
  });

  files: FileAsset[] = [];
  filteredFiles: FileAsset[] = [];
  partners: PartnerReference[] = [];
  loading = true;
  requestingAccessId: string | null = null;
  requestingTransferId: string | null = null;
  searchText = '';
  companyFilter = '';
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

  hasAccess(file: FileAsset): boolean {
    return (file.agreements?.length ?? 0) > 0;
  }

  async requestAccess(file: FileAsset): Promise<void> {
    this.requestingAccessId = file.id;
    try {
      await this.catalogService.requestAccess(file);
      this.modalAndAlert.showAlert('Access granted successfully.', 'Access request', 'success', 5);
      await this.loadData();
    } catch (error) {
      this.showError(error, 'Access request failed');
    } finally {
      this.requestingAccessId = null;
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

  openDetails(file: FileAsset): void {
    if (!file.id) {
      return;
    }
    void this.router.navigate(['/explore', file.id]);
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

  private async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [files, partners] = await Promise.all([
        this.filesService.getFilesForExploreView(),
        this.partnerService.getPartners(),
      ]);

      this.files = files;
      this.partners = partners;
      this.applyFilters();
    } catch (error) {
      this.files = [];
      this.filteredFiles = [];
      this.showError(error, 'Failed to load explore data');
    } finally {
      this.loading = false;
    }
  }

  private setupFilterListeners(): void {
    this.filterForm.controls.searchTerm.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.searchText = value.trim().toLowerCase();
        this.applyFilters();
      });

    this.filterForm.controls.companyFilter.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.companyFilter = value;
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
          file.partnerName,
        ]
          .filter((field): field is string => typeof field === 'string')
          .map(field => field.toLowerCase());

        return fields.some(field => field.includes(this.searchText));
      });
    }

    if (this.companyFilter) {
      next = next.filter(file => file.partnerDid === this.companyFilter);
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
