import { inject, Injectable } from '@angular/core';

import { Agreement, FileAsset } from '../models/file-asset.model';
import {
    Contract,
    ContractRequest,
    PartnerReference,
} from '../models/redline-data.model';
import { asString } from '../utils/cast.utils';
import { PartnerService } from './partner.service';
import { RedlineApiService } from './redline-api.service';
import { EdcClientService } from '@eclipse-edc/dashboard-core';
import { resolveDidProtocolEndpoint } from '../utils/did.utils';
import { Catalog, Dataset } from '@think-it-labs/edc-connector-client';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly redline = inject(RedlineApiService);
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

    const catalog = await (await this.edcClientService.getClient()).management.catalog.request({
      counterPartyId: partner.identifier,
      counterPartyAddress: protocolEndpoint
    });
    const compacted = await this.edcClientService.compact(catalog);
    console.log(compacted["http://www.w3.org/ns/dcat#dataset"] as Dataset[]);

    return catalog.datasets.map(dataset => {
      return {
        id: dataset.optionalValue('edc', 'fileId'),
        name: dataset.mandatoryValue('edc', 'name'),
        origin: 'remote',
        uploadedAt: dataset.optionalValue('edc', 'name'),
        assetId: dataset.mandatoryValue('edc', 'assetId'),
        size: dataset.optionalValue('edc', 'size'),
        partnerDid: catalog.participantId,
        partnerName: partner.nickname,
        catalogDataset: dataset,
      } as FileAsset
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
    // const dataset = file.catalogDataset as Dataset | undefined;
    // const properties = dataset?.['edc:properties'];
    // const assetId = asString(properties?.['edc:assetId']);
    // const firstPolicy = dataset?.hasPolicy?.[0];
    // const firstOfferId = firstPolicy?.['@id'];
    // const permissions = firstPolicy?.permission?.flatMap(permission => permission.constraint ?? []);
    //
    // if (!assetId || !file.partnerDid || !firstOfferId) {
    //   throw new Error('Missing data required to request access.');
    // }
    //
    // const request: ContractRequest = {
    //   offerId: firstOfferId,
    //   providerId: file.partnerDid,
    //   assetId,
    //   permissions,
    // };
    //
    // const negotiationId = await this.redline.requestContract(request);
    // await this.waitForContractFinalization(negotiationId);
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
