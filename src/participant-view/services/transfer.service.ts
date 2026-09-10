import { inject, Injectable } from '@angular/core';

import { FileAsset, Transaction } from '../models/file-asset.model';
import { TransferProcess } from '../models/redline-data.model';
import { RedlineApiService } from './redline-api.service';

@Injectable({ providedIn: 'root' })
export class TransferService {
  private readonly redline = inject(RedlineApiService);

  async requestTransferAndDownload(file: FileAsset): Promise<void> {
    if (!file.agreements?.[0]?.id || !file.catalogDataset?.distribution?.[0]?.format || !file.partnerDid) {
      throw new Error('Missing file data required for transfer and download.');
    }

    const transferProcessId = await this.redline.requestTransfer({
      contractId: file.agreements[0].id,
      counterPartyId: file.partnerDid,
      transferType: file.catalogDataset.distribution[0].format,
    });

    const transferProcess = await this.waitForTransferStarted(transferProcessId);
    const token = this.getDownloadToken(transferProcess);
    if (!token) {
      throw new Error('No authorization token returned for download.');
    }

    const data = await this.redline.downloadData(file.id, token);
    this.startBrowserDownload(data, file.name || 'download');
  }

  async getFileTransferHistory(file: FileAsset): Promise<Transaction[]> {
    if (!file.agreements || file.agreements.length === 0) {
      return [];
    }

    const transfers = await this.redline.listTransferProcesses();
    const history: Transaction[] = [];

    for (const agreement of file.agreements) {
      const related = transfers.filter(transfer => transfer.contractId === agreement.id);
      for (const transfer of related) {
        history.push({
          id: transfer.correlationId ?? `${agreement.id}-${transfer.stateTimestamp ?? Date.now()}`,
          partnerId: agreement.partnerId,
          partnerName: agreement.partnerName,
          type: transfer.type === 'CONSUMER' ? 'access' : 'share',
          status: (transfer.state ?? '').toUpperCase() === 'STARTED' ? 'success' : 'failed',
          timestamp: transfer.stateTimestamp
            ? new Date(transfer.stateTimestamp).toISOString()
            : new Date().toISOString(),
        });
      }
    }

    return history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  private async waitForTransferStarted(transferProcessId: string): Promise<TransferProcess> {
    const maxWaitMs = 30_000;
    const pollMs = 1_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
      await this.delay(pollMs);
      const transfer = await this.redline.getTransferProcess(transferProcessId);
      if ((transfer.state ?? '').toUpperCase() === 'STARTED') {
        return transfer;
      }
    }

    throw new Error('Transfer process timed out before reaching STARTED.');
  }

  private getDownloadToken(transfer: TransferProcess): string | null {
    const properties = transfer.contentDataAddress?.['properties'];
    if (!properties || typeof properties !== 'object') {
      return null;
    }

    const record = properties as Record<string, unknown>;
    const token = record['https://w3id.org/edc/v0.0.1/ns/authorization'];
    return typeof token === 'string' ? token : null;
  }

  private startBrowserDownload(data: Blob, filename: string): void {
    const url = window.URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }
}
