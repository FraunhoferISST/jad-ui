import { inject, Injectable } from '@angular/core';

import { DataspaceResponse, PartnerReference } from '../../app/redline/redline.models';
import { RedlineService } from '../../app/redline/redline.service';
import { ParticipantContextService } from './participant-context.service';

/** A dataspace the current participant has joined, with its partner references. */
export interface DataspacePartners {
  dataspace: DataspaceResponse;
  partners: PartnerReference[];
}

/**
 * Partner references always belong to a dataspace membership of the
 * authenticated participant, so every operation is scoped to one dataspace.
 */
@Injectable({ providedIn: 'root' })
export class PartnerService {
  private readonly context = inject(ParticipantContextService);
  private readonly redline = inject(RedlineService);

  /** Dataspaces the authenticated participant has joined, in backend order. */
  async getJoinedDataspaces(): Promise<DataspaceResponse[]> {
    const context = await this.context.resolve();
    return this.redline.getParticipantDataspaces(context.tenantId, context.participantId);
  }

  /** Partner references of every joined dataspace, for partner-name lookups. */
  async getPartners(): Promise<PartnerReference[]> {
    const { tenantId, participantId } = await this.context.resolve();
    const dataspaces = await this.redline.getParticipantDataspaces(tenantId, participantId);
    const lists = await Promise.all(
      dataspaces.map((dataspace) =>
        this.redline.getPartners(tenantId, participantId, dataspace.id),
      ),
    );
    return dedupe(lists.flat());
  }

  async getPartnersForDataspace(dataspaceId: number): Promise<PartnerReference[]> {
    const { tenantId, participantId } = await this.context.resolve();
    return this.redline.getPartners(tenantId, participantId, dataspaceId);
  }

  /** Loads each joined dataspace with its partner references in parallel. */
  async getDataspacePartners(): Promise<DataspacePartners[]> {
    const dataspaces = await this.getJoinedDataspaces();
    return Promise.all(
      dataspaces.map(async (dataspace) => ({
        dataspace,
        partners: await this.getPartnersForDataspace(dataspace.id),
      })),
    );
  }

  async addPartner(dataspaceId: number, partner: PartnerReference): Promise<PartnerReference> {
    const { tenantId, participantId } = await this.context.resolve();
    return this.redline.createPartner(tenantId, participantId, dataspaceId, partner);
  }
}

/** The same participant can be a partner in several dataspaces. */
function dedupe(partners: PartnerReference[]): PartnerReference[] {
  const byIdentifier = new Map<string, PartnerReference>();
  for (const partner of partners) {
    if (!partner.identifier || byIdentifier.has(partner.identifier)) continue;
    byIdentifier.set(partner.identifier, partner);
  }
  return [...byIdentifier.values()];
}
