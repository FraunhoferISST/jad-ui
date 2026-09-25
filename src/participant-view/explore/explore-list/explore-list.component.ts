import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FilterInputComponent,
  ItemCountSelectorComponent,
  ModalAndAlertService,
  PaginationComponent,
} from '@eclipse-edc/dashboard-core';

import { FileAsset } from '../../models/file-asset.model';
import { PartnerReference } from '../../models/redline-data.model';
import { CatalogService } from '../../services/catalog.service';
import { FilesService } from '../../services/files.service';
import { PartnerService } from '../../services/partner.service';
import { TransferService } from '../../services/transfer.service';
import { ExploreDetailComponent } from '../explore-detail/explore-detail.component';

@Component({
  selector: 'participant-explore-list',
  standalone: true,
  imports: [
    CommonModule,
    FilterInputComponent,
    ItemCountSelectorComponent,
    PaginationComponent,
  ],
  templateUrl: './explore-list.component.html',
})
export class ExploreListComponent {
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly filesService = inject(FilesService);
  private readonly partnerService = inject(PartnerService);
  private readonly catalogService = inject(CatalogService);
  private readonly transferService = inject(TransferService);

  files: FileAsset[] = [];
  filteredFiles: FileAsset[] = [];
  pageFiles: FileAsset[] = [];
  partners: PartnerReference[] = [];

  loading = true;
  pageItemCount = 10;
  searchText = '';
  companyFilter = '';
  requestingAccessId: string | null = null;
  requestingTransferId: string | null = null;

  constructor() {
    void this.loadData();
  }

  hasAccess(file: FileAsset): boolean {
    return (file.agreements?.length ?? 0) > 0;
  }

  filter(searchText: string): void {
    this.searchText = searchText.trim().toLowerCase();
    this.applyFilters();
  }

  onCompanyChange(event: Event): void {
    this.companyFilter = (event.target as HTMLSelectElement).value;
    this.applyFilters();
  }

  paginationEvent(pageItems: FileAsset[]): void {
    this.pageFiles = pageItems;
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
    this.modalAndAlert.openModal(
      ExploreDetailComponent,
      { fileId: file.id },
      undefined,
      true,
    );
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
      this.pageFiles = [];
      this.showError(error, 'Failed to load explore data');
    } finally {
      this.loading = false;
    }
  }

  private applyFilters(): void {
    let next = [...this.files];

    if (this.searchText) {
      next = next.filter(file => {
        const fields = [file.name, file.type, file.partnerName]
          .filter((field): field is string => typeof field === 'string')
          .map(field => field.toLowerCase());

        return fields.some(field => field.includes(this.searchText));
      });
    }

    if (this.companyFilter) {
      next = next.filter(file => file.partnerDid === this.companyFilter);
    }

    this.filteredFiles = next;
  }

  private showError(error: unknown, title: string): void {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    this.modalAndAlert.showAlert(message, title, 'error', 8);
  }
}
