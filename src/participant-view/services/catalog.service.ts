import { inject, Injectable } from '@angular/core';

import { EdcClientService } from '@eclipse-edc/dashboard-core';
import {
  ContractAgreement,
  Dataset,
  JsonLdService,
  PolicyBuilder,
  QuerySpec,
} from '@think-it-labs/edc-connector-client';

import { FileAsset } from '../models/file-asset.model';
import { asNumber, asString } from '../utils/cast.utils';
import { PartnerReference } from '../../app/redline/redline.models';
import { ExtendedEdcClient } from '../models/edc.model';
import { ContextDefinition } from 'jsonld';
import { pollUntil } from '../../app/utils/poll-until';
import { DidResolverService } from './did-resolver.service';
import { PartnerService } from './partner.service';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly partners = inject(PartnerService);
  private readonly didResolver = inject(DidResolverService);
  private readonly edcClientService = inject(EdcClientService);

  async getCatalogForAllPartners(): Promise<FileAsset[]> {
    const partnerList = await this.partners.getPartners();
    const results = await Promise.allSettled(
      partnerList.map((partner) => this.getPartnerCatalog(partner)),
    );

    return results
      .filter(
        (result): result is PromiseFulfilledResult<FileAsset[]> => result.status === 'fulfilled',
      )
      .flatMap((result) => result.value);
  }

  async getPartnerCatalog(partner: PartnerReference): Promise<FileAsset[]> {
    if (!partner.identifier) {
      return [];
    }

    const protocolEndpoint = await this.didResolver.resolveProtocolEndpoint(partner.identifier);
    if (!protocolEndpoint) {
      return [];
    }

    const catalog = await (
      await this.edcClientService.getClient()
    ).management.catalog.request({
      counterPartyId: partner.identifier,
      counterPartyAddress: protocolEndpoint,
    });

    return catalog.datasets.flatMap((dataset): FileAsset[] => {
      const assetId = asString(dataset['@id']);
      const id = asString(dataset.optionalValue('edc', 'fileId')) || assetId;
      if (!id) return []; // An unidentified dataset cannot be displayed or negotiated safely.
      return [
        {
          id,
          name: asString(dataset.optionalValue('edc', 'name')) || id,
          origin: 'remote',
          uploadedAt: 'N/A',
          assetId,
          size: asNumber(dataset.optionalValue('edc', 'size')),
          type: asString(dataset.optionalValue('edc', 'contenttype')),
          partnerDid: asString(catalog.participantId) || partner.identifier,
          partnerName: partner.nickname,
          catalogDataset: dataset,
        },
      ];
    });
  }

  async matchContractsToFiles(files: FileAsset[]): Promise<FileAsset[]> {
    const agreements = await this.listAgreements();

    for (const agreement of agreements) {
      if (!agreement.assetId) {
        continue;
      }

      const matchingFiles = files.filter((file) => file.assetId === agreement.assetId);
      for (const file of matchingFiles) {
        file.agreements = [...(file.agreements ?? []), agreement];
        if (file.uploadedAt === 'N/A' && agreement.contractSigningDate) {
          file.uploadedAt = agreement.contractSigningDate * 1000;
        }
      }
    }

    return files;
  }

  async getAgreementsForFile(file: FileAsset): Promise<ContractAgreement[]> {
    return file.assetId ? this.listAgreements(file.assetId) : [];
  }

  private async listAgreements(assetId?: string): Promise<ContractAgreement[]> {
    const client = (await this.edcClientService.getClient()) as ExtendedEdcClient;
    const querySpec: QuerySpec = { '@type': 'QuerySpec' };
    if (assetId) {
      querySpec.filterExpression = [
        { '@type': 'Criterion', operandLeft: 'assetId', operator: '=', operandRight: assetId },
      ];
    }
    return client.v5contractAgreements.queryAll(querySpec);
  }

  async requestAccess(file: FileAsset): Promise<void> {
    const dataset = file.catalogDataset as Dataset | undefined;
    const offer = dataset?.offers?.[0];

    if (!file.assetId || !file.partnerDid || !offer) {
      throw new Error('Missing data required to request access.');
    }

    const protocolEndpoint = await this.didResolver.resolveProtocolEndpoint(file.partnerDid);
    if (!protocolEndpoint) {
      throw new Error('Could not resolve protocol endpoint for partner.');
    }

    const service = new JsonLdService();
    const context: ContextDefinition = {
      '@context': [
        'https://w3id.org/dspace/2025/1/context.jsonld',
        'https://w3id.org/edc/dspace/v0.0.1',
      ],
    } as ContextDefinition;
    const compacted = await service.compact(dataset, context);

    let policyCompacted = (compacted['hasPolicy'] as Array<any>)[0];
    policyCompacted['target'] = dataset?.['@id'];
    policyCompacted['assigner'] = file.partnerDid;

    const policy = new PolicyBuilder().raw(policyCompacted).build();
    const negotiationId = (
      await (
        await this.edcClientService.getClient()
      ).management.contractNegotiations.initiate({
        counterPartyId: file.partnerDid,
        counterPartyAddress: protocolEndpoint,
        policy: policy,
      })
    ).id;

    await this.waitForContractFinalization(negotiationId);
  }

  private async waitForContractFinalization(negotiationId: string): Promise<void> {
    const client = await this.edcClientService.getClient();
    const finalized = await pollUntil(
      async () => {
        const negotiation = await client.management.contractNegotiations.get(negotiationId);
        return (negotiation.state ?? '').toUpperCase() === 'FINALIZED' ? true : undefined;
      },
      { intervalMs: 1_000, timeoutMs: 30_000, initialDelay: true },
    );
    if (!finalized) throw new Error('Contract negotiation timed out before reaching FINALIZED.');
  }
}
