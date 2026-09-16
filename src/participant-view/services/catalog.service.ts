import { inject, Injectable } from '@angular/core';

import { Agreement, FileAsset } from '../models/file-asset.model';
import {
  Contract,
  ContractRequest,
  Dataset,
  PartnerReference,
} from '../models/redline-data.model';
import { asNumber, asString } from '../utils/cast.utils';
import { DataspaceService } from './dataspace.service';
import { PartnerService } from './partner.service';
import { RedlineApiService } from './redline-api.service';
import { UseCaseService } from './use-case.service';
import { EdcClientService } from '@eclipse-edc/dashboard-core';
import { resolveDidProtocolEndpoint } from '../utils/did.utils';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly redline = inject(RedlineApiService);
  private readonly useCases = inject(UseCaseService);
  private readonly dataspaces = inject(DataspaceService);
  private readonly partners = inject(PartnerService);
  private readonly edcClientService = inject(EdcClientService);

  async getCatalogForAllPartners(): Promise<FileAsset[]> {
    const partnerList = await this.partners.getPartners();
    const results = await Promise.allSettled(
      partnerList.map(partner => this.getPartnerCatalog(partner)),
    );

    return results
      .filter((result): result is PromiseFulfilledResult<FileAsset[]> => result.status === 'fulfilled')
      .flatMap(result => result.value);
  }

  async getPartnerCatalog(partner: PartnerReference): Promise<FileAsset[]> {
    if (!partner.identifier) {
      return [];
    }
    const protocolEndpoint = await resolveDidProtocolEndpoint(partner.identifier, false);
    if (!protocolEndpoint) {
      return [];
    }

    const [catalog, useCases, dataspace] = await Promise.all([
      (await this.edcClientService.getClient()).management.catalog.request({
        counterPartyId: partner.identifier,
        counterPartyAddress: protocolEndpoint
      }),
      this.useCases.getUseCases(),
      this.dataspaces.getPrimaryDataspace(),
    ]);

    return (catalog.datasets ?? []).map(dataset => {
      const properties = dataset['edc:properties'] ?? {};
      const useCaseId = asString(properties['edc:useCase']);
      const originalFilename = asString(properties['edc:originalFilename']) ?? 'N/A';
      const assetId = asString(properties['edc:assetId']);
      const fileId = asString(properties['edc:fileId']) ?? originalFilename;

      return {
        id: fileId,
        name: originalFilename,
        description: asString(properties['description']) ?? 'N/A',
        useCase: useCaseId,
        useCaseLabel: useCases.find(item => item.id === useCaseId)?.label,
        origin: 'remote',
        uploadedAt: 'N/A',
        dataspace: dataspace.name,
        catalogDataset: dataset,
        partnerName: partner.nickname,
        partnerDid: partner.identifier,
        assetId,
        size: asNumber(properties['edc:size']),
      } satisfies FileAsset;
    });
  }

  async matchContractsToFiles(files: FileAsset[]): Promise<FileAsset[]> {
    const [contracts, partners] = await Promise.all([
      this.redline.listContracts(),
      this.partners.getPartners(),
    ]);

    const partnerNames = new Map(
      partners.filter(item => !!item.identifier).map(item => [item.identifier, item.nickname ?? 'N/A']),
    );

    for (const contract of contracts) {
      if (!contract.assetId || contract.pending) {
        continue;
      }

      const matchingFiles = files.filter(file => file.assetId === contract.assetId);
      for (const file of matchingFiles) {
        const agreement = this.toAgreement(contract, partnerNames);
        if (!agreement) {
          continue;
        }

        file.agreements = [...(file.agreements ?? []), agreement];
        if (file.uploadedAt === 'N/A' && agreement.createdAt) {
          file.uploadedAt = agreement.createdAt;
        }
      }
    }

    return files;
  }

  private toAgreement(contract: Contract, partnerNames: Map<string, string>): Agreement | null {
    if (!contract.id || !contract.counterParty) {
      return null;
    }

    return {
      id: contract.id,
      partnerId: contract.counterParty,
      partnerName: partnerNames.get(contract.counterParty) ?? contract.counterParty,
      status: contract.pending ? 'Pending' : 'Active',
      createdAt: contract.signingDate ?? '',
    };
  }

  async requestAccess(file: FileAsset): Promise<void> {
    const dataset = file.catalogDataset as Dataset | undefined;
    const properties = dataset?.['edc:properties'];
    const assetId = asString(properties?.['edc:assetId']);
    const firstPolicy = dataset?.hasPolicy?.[0];
    const firstOfferId = firstPolicy?.['@id'];
    const permissions = firstPolicy?.permission?.flatMap(permission => permission.constraint ?? []);

    if (!assetId || !file.partnerDid || !firstOfferId) {
      throw new Error('Missing data required to request access.');
    }

    const request: ContractRequest = {
      offerId: firstOfferId,
      providerId: file.partnerDid,
      assetId,
      permissions,
    };

    const negotiationId = await this.redline.requestContract(request);
    await this.waitForContractFinalization(negotiationId);
  }

  private async waitForContractFinalization(negotiationId: string): Promise<void> {
    const maxWaitMs = 30_000;
    const pollMs = 1_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
      await this.delay(pollMs);
      const negotiation = await this.redline.getContractNegotiation(negotiationId);
      if ((negotiation.state ?? '').toUpperCase() === 'FINALIZED') {
        return;
      }
    }

    throw new Error('Contract negotiation timed out before reaching FINALIZED.');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }
}
