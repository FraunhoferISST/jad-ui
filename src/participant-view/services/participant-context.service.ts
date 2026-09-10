import { inject, Injectable } from '@angular/core';
import { AuthService } from '../../app/auth/auth.service';
import { RedlineService } from '../../operator-view/services/redline.service';
import { ParticipantContext } from '../models/participant-context.models';
import { ParticipantConfigService } from './participant-config.service';

@Injectable({ providedIn: 'root' })
export class ParticipantContextService {
  private readonly auth = inject(AuthService);
  private readonly redline = inject(RedlineService);
  private readonly participantConfig = inject(ParticipantConfigService);

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
      .then(context => {
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
    if (!user || user.role !== 'participant' || !user.participantEdcConfig?.did) {
      throw new Error('Participant context is unavailable for the current user session.');
    }

    const participantDid = user.participantEdcConfig.did;
    const providers = await this.redline.getServiceProviders();
    if (providers.length === 0) {
      throw new Error('No service providers were found while resolving participant context.');
    }

    const preferredProviderId = await this.participantConfig.getDefaultServiceProviderId();
    const orderedProviderIds = this.orderProviderIds(
      providers.map(provider => provider.id),
      preferredProviderId,
    );

    for (const providerId of orderedProviderIds) {
      const tenants = await this.redline.listTenants(providerId);
      for (const tenant of tenants ?? []) {
        let participants = tenant.participants ?? [];
        if (participants.length === 0) {
          try {
            const detailedTenant = await this.redline.getTenant(providerId, tenant.id);
            participants = detailedTenant.participants ?? [];
          } catch {
            participants = [];
          }
        }

        for (const participant of participants) {
          if (participant.identifier === participantDid) {
            return {
              providerId,
              tenantId: tenant.id,
              participantId: participant.id,
              participantIdentifier: participant.identifier,
              tenantName: tenant.name,
            };
          }
        }
      }
    }

    throw new Error(
      `Could not map participant DID "${participantDid}" to any Redline tenant participant.`,
    );
  }

  private orderProviderIds(providerIds: number[], preferred: number | null): number[] {
    if (preferred === null || !providerIds.includes(preferred)) {
      return providerIds;
    }

    return [preferred, ...providerIds.filter(id => id !== preferred)];
  }
}
