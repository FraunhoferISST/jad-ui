import { inject, Injectable } from '@angular/core';
import { AuthService } from '../../app/auth/auth.service';
import { isTenantRole } from '../../app/auth/auth.types';
import { RedlineService } from '../../operator-view/services/redline.service';
import { ParticipantContext } from '../models/participant-context.models';

@Injectable({ providedIn: 'root' })
export class ParticipantContextService {
  private readonly auth = inject(AuthService);
  private readonly redline = inject(RedlineService);

  private cachedContext: ParticipantContext | null = null;
  private resolvingPromise: Promise<ParticipantContext> | null = null;

  async resolve(): Promise<ParticipantContext> {
    if (this.cachedContext) {
      return this.cachedContext;
    }

    if (this.resolvingPromise) {
      return this.resolvingPromise;
    }

    this.resolvingPromise = this.resolveInternal()
      .then((context) => {
        this.cachedContext = context;
        return context;
      })
      .finally(() => {
        this.resolvingPromise = null;
      });

    return this.resolvingPromise;
  }

  reset(): void {
    this.cachedContext = null;
    this.resolvingPromise = null;
  }

  private async resolveInternal(): Promise<ParticipantContext> {
    const user = this.auth.user();
    if (!user || !isTenantRole(user.role) || !user.participantEdcConfig?.did) {
      throw new Error('Participant context is unavailable for the current user session.');
    }

    const participantDid = user.participantEdcConfig.did;
    const tenants = await this.redline.listTenants();
    for (const tenant of tenants ?? []) {
      let participants = tenant.participants ?? [];
      if (participants.length === 0) {
        try {
          const detailedTenant = await this.redline.getTenant(tenant.id);
          participants = detailedTenant.participants ?? [];
        } catch {
          participants = [];
        }
      }

      for (const participant of participants) {
        if (participant.identifier === participantDid) {
          return {
            tenantId: tenant.id,
            participantId: participant.id,
            participantIdentifier: participant.identifier,
            tenantName: tenant.name,
          };
        }
      }
    }

    throw new Error(
      `Could not map participant DID "${participantDid}" to a Redline tenant participant under the seeded service provider.`,
    );
  }
}
