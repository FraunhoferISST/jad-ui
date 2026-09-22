import { inject, Injectable } from '@angular/core';

import { EdcClientService } from '@eclipse-edc/dashboard-core';
import {
    ContractAgreement,
    Dataset,
    JsonLdService, PolicyBuilder
} from '@think-it-labs/edc-connector-client';

import { FileAsset } from '../models/file-asset.model';
import { PartnerReference } from '../models/redline-data.model';
import { resolveDidProtocolEndpoint } from '../utils/did.utils';
import { PartnerService } from './partner.service';
import { ExtendedEdcClient } from '../models/edc.model';
import { ContextDefinition } from 'jsonld';

@Injectable({ providedIn: 'root' })
export class CatalogService {
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

    let catalog = await (await this.edcClientService.getClient()).management.catalog.request({
      counterPartyId: partner.identifier,
      counterPartyAddress: protocolEndpoint
    });


    return catalog.datasets.map(dataset => {
      return {
        id: dataset.optionalValue('edc', 'fileId'),
        name: dataset.mandatoryValue('edc', 'name'),
        origin: 'remote',
        uploadedAt: dataset.optionalValue('edc', 'name'),
        assetId: dataset['@id'],
        size: dataset.optionalValue('edc', 'size'),
        type: dataset.optionalValue('edc', 'contenttype'),
        partnerDid: catalog.participantId,
        partnerName: partner.nickname,
        catalogDataset: dataset,
      } as FileAsset
    });
  }

  async matchContractsToFiles(files: FileAsset[]): Promise<FileAsset[]> {
    const [agreements, partners] = await Promise.all([
      this.listAgreements(),
      this.partners.getPartners(),
    ]);

    const partnerNames = new Map(
      partners.filter(item => !!item.identifier).map(item => [item.identifier, item.nickname ?? 'N/A']),
    );

    for (const agreement of agreements) {
      if (!agreement.assetId) {
        continue;
      }

      const matchingFiles = files.filter(file => file.assetId === agreement.assetId);
      for (const file of matchingFiles) {
        file.agreements = [...(file.agreements ?? []), agreement];
        if (file.uploadedAt === 'N/A' && agreement.contractSigningDate) {
          file.uploadedAt = agreement.contractSigningDate;
        }
      }
    }

    return files;
  }

  private async listAgreements(): Promise<ContractAgreement[]> {
    const client = (await this.edcClientService.getClient()) as ExtendedEdcClient;
    return client.v5contractAgreements.queryAll({"@type": 'QuerySpec'});
  }

  async requestAccess(file: FileAsset): Promise<void> {
    const dataset = file.catalogDataset as Dataset | undefined;
    let offer = dataset?.offers?.[0];

    if (!file.assetId || !file.partnerDid || !offer) {
      throw new Error('Missing data required to request access.');
    }

    const protocolEndpoint = await resolveDidProtocolEndpoint(file.partnerDid, false);
    if (!protocolEndpoint) {
      throw new Error('Could not resolve protocol endpoint for partner.');
    }

    const service = new JsonLdService();
    const context: ContextDefinition = {
      "@context": [
        "https://w3id.org/dspace/2025/1/context.jsonld",
        "https://w3id.org/edc/dspace/v0.0.1"
      ]
    } as ContextDefinition;
    const compacted = await service.compact(dataset, context);
    console.log(JSON.stringify(compacted));

    let policyCompacted = (compacted['hasPolicy'] as Array<any>)[0];
    policyCompacted['target'] = dataset?.['@id'];
    policyCompacted['assigner'] = file.partnerDid;

    const policy = new PolicyBuilder().raw(policyCompacted).build();
    const negotiationId = (
      await (await this.edcClientService.getClient()).management.contractNegotiations.initiate({
        counterPartyId: file.partnerDid,
        counterPartyAddress: protocolEndpoint,
        policy: policy
      })
    ).id;

    await this.waitForContractFinalization(negotiationId);
  }

  private async waitForContractFinalization(negotiationId: string): Promise<void> {
    const maxWaitMs = 30_000;
    const pollMs = 1_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
      await this.delay(pollMs);
      const negotiation = await (
        await this.edcClientService.getClient()
      ).management.contractNegotiations.get(negotiationId);
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
