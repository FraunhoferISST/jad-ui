import { DatePipe, TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { ContractAgreement } from '@think-it-labs/edc-connector-client';
import { FileAsset, Transaction } from '../models/file-asset.model';
import { CatalogService } from '../services/catalog.service';
import { TransferService } from '../services/transfer.service';
import { ContractSharing } from '../utils/contract-sharing';
import { DATE_FORMATS } from '../utils/format.utils';
import { showError } from '../../app/utils/show-error';

@Component({
  selector: 'app-file-activity',
  imports: [DatePipe, TitleCasePipe],
  templateUrl: './file-activity.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileActivityComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly transfer = inject(TransferService);
  private readonly alerts = inject(ModalAndAlertService);

  readonly file = input.required<FileAsset>();
  readonly contractSharing = input<ContractSharing>();
  readonly agreementsLoaded = output<ContractAgreement[]>();
  readonly agreements = signal<ContractAgreement[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly loadingAgreements = signal(true);
  readonly loadingTransferHistory = signal(true);
  readonly DATE_FORMATS = DATE_FORMATS;

  async ngOnInit(): Promise<void> {
    await this.reloadAgreements();
    await this.loadTransferHistory();
  }

  async reloadAgreements(): Promise<void> {
    this.loadingAgreements.set(true);
    let agreements: ContractAgreement[];
    try {
      agreements = await this.catalog.getAgreementsForFile(this.file());
    } catch (error) {
      showError(this.alerts, error, 'Failed to load agreements');
      agreements = [];
    }
    this.file().agreements = agreements;
    this.agreements.set(agreements);
    this.agreementsLoaded.emit(agreements);
    this.loadingAgreements.set(false);
  }

  private async loadTransferHistory(): Promise<void> {
    try {
      const transactions = await this.transfer.getFileTransferHistory(this.file());
      this.file().transactionHistory = transactions;
      this.transactions.set(transactions);
    } catch (error) {
      showError(this.alerts, error, 'Failed to load transfer history');
      this.file().transactionHistory = [];
      this.transactions.set([]);
    } finally {
      this.loadingTransferHistory.set(false);
    }
  }

  agreementPartnerName(agreement: ContractAgreement): string {
    const file = this.file();
    if (file.origin !== 'owned') {
      return file.partnerName || file.partnerDid || agreement.providerId || 'N/A';
    }
    const partnerId = agreement.consumerId;
    const partner = this.contractSharing()?.partners.find((item) => item.identifier === partnerId);
    return partner?.nickname || partnerId || 'N/A';
  }
}
