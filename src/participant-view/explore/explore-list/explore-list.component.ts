import { Component, computed, inject, signal } from '@angular/core';
import {
  FilterInputComponent,
  ItemCountSelectorComponent,
  ModalAndAlertService,
  PaginationComponent,
} from '@eclipse-edc/dashboard-core';
import { PartnerReference } from '../../../app/redline/redline.models';
import { FileAsset } from '../../models/file-asset.model';
import { CatalogService } from '../../services/catalog.service';
import { FileDownloadService } from '../../services/file-download.service';
import { FilesService } from '../../services/files.service';
import { PartnerService } from '../../services/partner.service';
import { showError } from '../../../app/utils/show-error';
import { ExploreDetailComponent } from '../explore-detail/explore-detail.component';

@Component({
  selector: 'app-participant-explore-list',
  imports: [FilterInputComponent, ItemCountSelectorComponent, PaginationComponent],
  templateUrl: './explore-list.component.html',
})
export class ExploreListComponent {
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly filesService = inject(FilesService);
  private readonly partnerService = inject(PartnerService);
  private readonly catalogService = inject(CatalogService);
  private readonly downloads = inject(FileDownloadService);

  readonly files = signal<FileAsset[]>([]);
  readonly pageFiles = signal<FileAsset[]>([]);
  readonly partners = signal<PartnerReference[]>([]);
  readonly loading = signal(true);
  readonly pageItemCount = signal(10);
  readonly searchText = signal('');
  readonly companyFilter = signal('');
  readonly requestingAccessId = signal<string | null>(null);
  readonly requestingTransferId = signal<string | null>(null);
  readonly filteredFiles = computed(() => {
    const query = this.searchText();
    const company = this.companyFilter();
    return this.files().filter(
      (file) =>
        (!company || file.partnerDid === company) &&
        (!query ||
          [file.name, file.type, file.partnerName].some((field) =>
            field?.toLowerCase().includes(query),
          )),
    );
  });

  constructor() {
    void this.loadData();
  }

  hasAccess(file: FileAsset): boolean {
    return (file.agreements?.length ?? 0) > 0;
  }
  filter(searchText: string): void {
    this.searchText.set(searchText.trim().toLowerCase());
  }
  onCompanyChange(event: Event): void {
    this.companyFilter.set((event.target as HTMLSelectElement).value);
  }
  paginationEvent(pageItems: FileAsset[]): void {
    this.pageFiles.set(pageItems);
  }

  async requestAccess(file: FileAsset): Promise<void> {
    this.requestingAccessId.set(file.id);
    try {
      await this.catalogService.requestAccess(file);
      this.modalAndAlert.showAlert('Access granted successfully.', 'Access request', 'success', 5);
      await this.loadData();
    } catch (error) {
      showError(this.modalAndAlert, error, 'Access request failed');
    } finally {
      this.requestingAccessId.set(null);
    }
  }

  async requestTransferAndDownload(file: FileAsset): Promise<void> {
    this.requestingTransferId.set(file.id);
    try {
      await this.downloads.download(file);
    } catch (error) {
      showError(this.modalAndAlert, error, 'Download failed');
    } finally {
      this.requestingTransferId.set(null);
    }
  }

  openDetails(file: FileAsset): void {
    this.modalAndAlert.openModal(ExploreDetailComponent, { file }, undefined, true);
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const [files, partners] = await Promise.all([
        this.filesService.getFilesForExploreView(),
        this.partnerService.getPartners(),
      ]);
      this.files.set(files);
      this.partners.set(partners);
    } catch (error) {
      this.files.set([]);
      this.pageFiles.set([]);
      this.partners.set([]);
      showError(this.modalAndAlert, error, 'Failed to load explore data');
    } finally {
      this.loading.set(false);
    }
  }
}
