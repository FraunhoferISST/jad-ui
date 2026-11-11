import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { EdcClientService } from '@eclipse-edc/dashboard-core';
import { TransferProcess } from '@think-it-labs/edc-connector-client';

import { AuthService } from '../../app/auth/auth.service';
import { pollUntil } from '../../app/utils/poll-until';
import { FileAsset, Transaction } from '../models/file-asset.model';
import { DidResolverService } from './did-resolver.service';
import { triggerBrowserDownload } from '../utils/browser-download';
import { participantAuthorization } from '../utils/participant-auth';
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
  private readonly didResolver = inject(DidResolverService);
  private readonly participantConfig = inject(ParticipantConfigService);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  async requestTransferAndDownload(file: FileAsset): Promise<void> {
    const transferProcessId = await this.requestTransfer(file);
    await this.waitForTransferStarted(transferProcessId);

    const edr = await this.resolveEdr(transferProcessId);
    await this.downloadFromEdr(edr, file.name);
  }

  private async requestTransfer(file: FileAsset): Promise<string> {
    if (!file.agreements?.[0]?.['@id'] || !file.partnerDid) {
      throw new Error('Missing file data required for transfer and download.');
    }

    const protocolEndpoint = await this.didResolver.resolveProtocolEndpoint(file.partnerDid);
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
      const related = transfers.filter((transfer) => transfer.contractId === agreement.id);
      const partnerId = file.origin === 'owned' ? agreement.consumerId : agreement.providerId;
      const partnerName = partnerNames.get(partnerId);
      for (const transfer of related) {
        history.push({
          id: transfer.id,
          partnerId,
          partnerName: partnerName ?? 'unknown',
          type: transfer.type === 'CONSUMER' ? 'access' : 'share',
          status: (transfer.state ?? '').toUpperCase() === 'STARTED' ? 'success' : 'failed',
          timestamp: this.transferTimestamp(transfer),
        });
      }
    }

    return history.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
  }

  private transferTimestamp(transfer: TransferProcess): string | null {
    // EDC timestamps are epoch milliseconds. JAD omits createdAt and exposes
    // stateTimestamp (the last state change) only as an expanded JSON-LD value.
    for (const timestamp of [
      transfer.createdAt,
      transfer.optionalValue<number>('edc', 'stateTimestamp'),
    ]) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
        continue;
      }
      const date = new Date(timestamp);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    // Do not misrepresent the time the dialog was opened as the transfer date.
    return null;
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
    const { participantContextId, headers } = participantAuthorization(
      this.auth,
      'the transfer download',
    );

    const { baseUrl } = await this.participantConfig.getSigletConfig();
    const url = `${baseUrl.replace(/\/$/, '')}/tokens/${encodeURIComponent(
      participantContextId,
    )}/${encodeURIComponent(transferProcessId)}`;

    const edr = await firstValueFrom(
      this.http.get<SigletEdr>(url, {
        headers,
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

    triggerBrowserDownload(blob, filename);
  }

  private async waitForTransferStarted(transferProcessId: string): Promise<TransferProcess> {
    const client = await this.edcClientService.getClient();
    const transfer = await pollUntil(
      async () => {
        const result = await client.management.transferProcesses.get(transferProcessId);
        const state = (result.state ?? '').toUpperCase();
        if (state === 'TERMINATED') {
          throw new Error(
            `Transfer process terminated: ${result.errorDetail || 'no reason provided'}`,
          );
        }
        return state === 'STARTED' ? result : undefined;
      },
      { intervalMs: 1_000, timeoutMs: 30_000, initialDelay: true },
    );
    if (!transfer) throw new Error('Transfer process timed out before reaching STARTED.');
    return transfer;
  }
}
