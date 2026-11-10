import { inject, Injectable } from '@angular/core';
import { EdcClientService } from '@eclipse-edc/dashboard-core';
import { ContractDefinition } from '@think-it-labs/edc-connector-client';

import { ContractSharing, getContractSharing } from '../utils/contract-sharing';
import { PartnerService } from './partner.service';

@Injectable({ providedIn: 'root' })
export class ContractSharingService {
  private readonly edcClientService = inject(EdcClientService);
  private readonly partnerService = inject(PartnerService);

  async getSharing(definitions: ContractDefinition[]): Promise<Map<string, ContractSharing>> {
    const [client, partners] = await Promise.all([
      this.edcClientService.getClient(),
      this.partnerService.getPartners(),
    ]);
    const policyIds = [
      ...new Set(
        definitions.flatMap((definition) => [
          definition.accessPolicyId,
          definition.contractPolicyId,
        ]),
      ),
    ];
    const policies = new Map(
      await Promise.all(
        policyIds.map(async (id) => {
          try {
            return [id, (await client.management.policyDefinitions.get(id)).policy] as const;
          } catch {
            // Missing previews must not block uploading or viewing a file.
            return [id, undefined] as const;
          }
        }),
      ),
    );
    return new Map(
      definitions.map((definition) => [
        definition.id,
        getContractSharing(
          policies.get(definition.accessPolicyId),
          policies.get(definition.contractPolicyId),
          partners,
        ),
      ]),
    );
  }
}
