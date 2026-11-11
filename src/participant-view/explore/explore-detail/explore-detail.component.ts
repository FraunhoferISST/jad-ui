import { TitleCasePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { ContractAgreement } from '@think-it-labs/edc-connector-client';
import { FileActivityComponent } from '../../file-activity/file-activity.component';
import { FileAsset } from '../../models/file-asset.model';
import { CatalogService } from '../../services/catalog.service';
import { FileDownloadService } from '../../services/file-download.service';
import { formatFileSize } from '../../utils/format.utils';
import { showError } from '../../../app/utils/show-error';

@Component({
  selector: 'app-participant-explore-detail',
  imports: [TitleCasePipe, FileActivityComponent],
  templateUrl: './explore-detail.component.html',
})
export class ExploreDetailComponent implements OnInit {
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly catalog = inject(CatalogService);
  private readonly downloads = inject(FileDownloadService);
  private readonly activity = viewChild.required(FileActivityComponent);

  readonly file = input.required<FileAsset>();
  readonly formatFileSize = formatFileSize;
  readonly requestingAccess = signal(false);
  readonly requestingTransfer = signal(false);
  private readonly agreementCount = signal(0);
  readonly hasAccess = computed(() => this.agreementCount() > 0);

  ngOnInit(): void {
    this.agreementCount.set(this.file().agreements?.length ?? 0);
  }

  onAgreementsLoaded(agreements: ContractAgreement[]): void {
    this.agreementCount.set(agreements.length);
  }

  async requestAccess(): Promise<void> {
    this.requestingAccess.set(true);
    try {
      await this.catalog.requestAccess(this.file());
      this.modalAndAlert.showAlert('Access granted successfully.', 'Access request', 'success', 5);
      await this.activity().reloadAgreements();
    } catch (error) {
      showError(this.modalAndAlert, error, 'Access request failed');
    } finally {
      this.requestingAccess.set(false);
    }
  }

  async download(): Promise<void> {
    this.requestingTransfer.set(true);
    try {
      await this.downloads.download(this.file());
    } catch (error) {
      showError(this.modalAndAlert, error, 'Download failed');
    } finally {
      this.requestingTransfer.set(false);
    }
  }
}
