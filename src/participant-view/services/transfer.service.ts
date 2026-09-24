import { inject, Injectable } from '@angular/core';

import { EdcClientService } from '@eclipse-edc/dashboard-core';
import {
    TransferProcess
} from '@think-it-labs/edc-connector-client';

import { FileAsset, Transaction } from '../models/file-asset.model';
import { resolveDidProtocolEndpoint } from '../utils/did.utils';
import { PartnerService } from './partner.service';

@Injectable({ providedIn: 'root' })
export class TransferService {
  private readonly edcClientService = inject(EdcClientService);
  private readonly partnerService = inject(PartnerService);

  async requestTransferAndDownload(file: FileAsset): Promise<void> {
    const transferProcess = await this.requestTransfer(file);
    await this.waitForTransferStarted(transferProcess);
    // TODO: Implement the actual download from the provider data plane once the
    // EDR (endpoint data reference) is available after the transfer reaches STARTED.
  }

  async requestTransfer(file: FileAsset): Promise<string> {
    if (!file.agreements?.[0]?.['@id']|| !file.partnerDid) {
      throw new Error('Missing file data required for transfer and download.');
    }

    const protocolEndpoint = await resolveDidProtocolEndpoint(file.partnerDid, false);
    if (!protocolEndpoint) {
      throw new Error('Could not resolve protocol endpoint for partner.');
    }

    const response = await (
      await this.edcClientService.getClient()
    ).management.transferProcesses.initiate({
      counterPartyId: file.partnerDid,
      counterPartyAddress: protocolEndpoint,
      contractId: file.agreements[0]['@id'],
      transferType: 'HttpData-PULL',
    });

    return response.id;
  }

  async getFileTransferHistory(file: FileAsset): Promise<Transaction[]> {
    if (!file.agreements || file.agreements.length === 0) {
      return [];
    }

    const partnerIds = this.partnerIdsFromMetadata(file);
    const partners = await this.partnerService.getPartners();
    const partnerNames = new Map(
      partners.filter(partner => !!partner.identifier).map(partner => [partner.identifier, partner.nickname]),
    );

    const transfers = await (
      await this.edcClientService.getClient()
    ).management.transferProcesses.queryAll();
    const history: Transaction[] = [];

    for (const agreement of file.agreements) {
      if (partnerIds.length > 0) {
        const agreementPartnerId = file.origin === 'owned' ? agreement.consumerId : agreement.providerId;
        if (!partnerIds.includes(agreementPartnerId)) {
          continue;
        }
      }

      const related = transfers.filter(transfer => transfer.contractId === agreement.id);
      const partnerId = file.origin === 'owned' ? agreement.consumerId : agreement.providerId;
      const partnerName = partnerNames.get(partnerId);
      for (const transfer of related) {
        history.push({
          id: transfer.correlationId ?? `${agreement.id}-${transfer.createdAt ?? Date.now()}`,
          partnerId,
          partnerName: partnerName ?? 'unknown',
          type: transfer.type === 'CONSUMER' ? 'access' : 'share',
          status: (transfer.state ?? '').toUpperCase() === 'STARTED' ? 'success' : 'failed',
          timestamp: transfer.createdAt
            ? new Date(transfer.createdAt * 1000).toISOString()
            : new Date().toISOString(),
        });
      }
    }

    return history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  private partnerIdsFromMetadata(file: FileAsset): string[] {
    return (file.accessRestrictions ?? [])
      .map(restriction => restriction.partnerId)
      .filter((partnerId): partnerId is string => !!partnerId);
  }

  private async waitForTransferStarted(transferProcessId: string): Promise<TransferProcess> {
    const maxWaitMs = 30_000;
    const pollMs = 1_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
      await this.delay(pollMs);
      const transfer = await (
        await this.edcClientService.getClient()
      ).management.transferProcesses.get(transferProcessId);
      if ((transfer.state ?? '').toUpperCase() === 'STARTED') {
        return transfer;
      }
    }

    throw new Error('Transfer process timed out before reaching STARTED.');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }
}
