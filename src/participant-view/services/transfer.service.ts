import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { EdcClientService } from '@eclipse-edc/dashboard-core';
import { TransferProcess } from '@think-it-labs/edc-connector-client';

import { AuthService } from '../../app/auth/auth.service';
import { FileAsset, Transaction } from '../models/file-asset.model';
import { resolveDidProtocolEndpoint } from '../utils/did.utils';
import { ParticipantConfigService } from './participant-config.service';
import { PartnerService } from './partner.service';

/**
 * A per-transfer endpoint data reference (EDR) issued by the JAD data plane (siglet).
 * The token is the bearer credential to present to the data-plane download endpoint.
 */
interface SigletEdr {
  token: string;
  endpoint?: string;
}

@Injectable({ providedIn: 'root' })
export class TransferService {
  private readonly edcClientService = inject(EdcClientService);
  private readonly partnerService = inject(PartnerService);
  private readonly participantConfig = inject(ParticipantConfigService);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  async requestTransferAndDownload(file: FileAsset): Promise<void> {
    const transferProcessId = await this.requestTransfer(file);
    await this.waitForTransferStarted(transferProcessId);

    const edr = await this.resolveEdr(transferProcessId);
    await this.downloadFromEdr(edr, file.name);
  }

  async requestTransfer(file: FileAsset): Promise<string> {
    if (!file.agreements?.[0]?.['@id'] || !file.partnerDid) {
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
      // The JAD data plane (siglet) is registered for the DSP http-pull profile,
      // not the EDC built-in 'HttpData-PULL' transfer type.
      transferType: 'https://w3id.org/dspace-sig/profile/http-pull',
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
      partners
        .filter((partner) => !!partner.identifier)
        .map((partner) => [partner.identifier, partner.nickname]),
    );

    const transfers = await (
      await this.edcClientService.getClient()
    ).management.transferProcesses.queryAll();
    const history: Transaction[] = [];

    for (const agreement of file.agreements) {
      if (partnerIds.length > 0) {
        const agreementPartnerId =
          file.origin === 'owned' ? agreement.consumerId : agreement.providerId;
        if (!partnerIds.includes(agreementPartnerId)) {
          continue;
        }
      }

      const related = transfers.filter((transfer) => transfer.contractId === agreement.id);
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

  /**
   * Resolves the EDR (endpoint data reference) for a started PULL transfer.
   *
   * The JAD control plane exposes no EDR management API; the provider data plane
   * (siglet) issues a per-transfer access token instead. Its token API is
   * `GET {siglet}/tokens/{participantContextId}/{transferProcessId}` and returns
   * `{ token, endpoint }`, where `token` authenticates the data-plane request.
   */
  private async resolveEdr(transferProcessId: string): Promise<SigletEdr> {
    const participantContextId = this.auth.user()?.participantContextId;
    if (!participantContextId) {
      throw new Error('Participant context id is unavailable for the transfer download.');
    }

    const token = this.auth.session()?.token;
    if (!token) {
      throw new Error('Authentication token is unavailable for the transfer download.');
    }

    const { baseUrl } = await this.participantConfig.getSigletConfig();
    const url = `${baseUrl.replace(/\/$/, '')}/tokens/${encodeURIComponent(
      participantContextId,
    )}/${encodeURIComponent(transferProcessId)}`;

    const edr = await firstValueFrom(
      this.http.get<SigletEdr>(url, {
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
      }),
    );

    if (typeof edr?.token !== 'string' || !edr.token.trim()) {
      throw new Error(
        'Transfer started but the data plane did not issue an access token for download.',
      );
    }

    return edr;
  }

  /** Use the provider's EDR endpoint; do not substitute the consumer's file store. */
  private downloadEndpointFrom(edr: SigletEdr): string {
    try {
      const endpoint = new URL(edr.endpoint ?? '');
      if (
        ['http:', 'https:'].includes(endpoint.protocol) &&
        !endpoint.username &&
        !endpoint.password
      ) {
        return endpoint.href;
      }
    } catch {
      // Report a malformed/missing endpoint before sending the transfer credential.
    }
    throw new Error('Transfer started but the data plane returned an invalid download endpoint.');
  }

  /**
   * Fetches the file from the provider data plane endpoint using the EDR token
   * and triggers a real browser download of the returned blob.
   */
  private async downloadFromEdr(edr: SigletEdr, filename: string): Promise<void> {
    const endpoint = this.downloadEndpointFrom(edr);
    const blob = await firstValueFrom(
      this.http.get(endpoint, {
        headers: new HttpHeaders({ Authorization: `Bearer ${edr.token}` }),
        responseType: 'blob' as const,
      }),
    );

    this.triggerBrowserDownload(blob, filename);
  }

  private triggerBrowserDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename || 'download';
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      // Give the browser time to consume the object URL before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }

  private partnerIdsFromMetadata(file: FileAsset): string[] {
    return (file.accessRestrictions ?? [])
      .map((restriction) => restriction.partnerId)
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
      const state = (transfer.state ?? '').toUpperCase();
      if (state === 'STARTED') {
        return transfer;
      }
      if (state === 'TERMINATED') {
        throw new Error(
          `Transfer process terminated: ${transfer.errorDetail || 'no reason provided'}`,
        );
      }
    }

    throw new Error('Transfer process timed out before reaching STARTED.');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
