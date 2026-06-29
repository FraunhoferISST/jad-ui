import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  FilterInputComponent,
  ItemCountSelectorComponent,
  ModalAndAlertService,
  PaginationComponent,
} from '@eclipse-edc/dashboard-core';

import { RedlineService } from '../services/redline.service';
import {
  DataspaceRequest,
  DataspaceResponse,
  Participant,
  ServiceProvider,
  ServiceProviderResponse,
  Tenant,
  TenantRegistration,
} from '../models/redline.models';
import { TenantCardComponent } from './tenant-card/tenant-card.component';
import { ServiceProviderFormComponent } from './service-provider-form/service-provider-form.component';
import { DataspaceFormComponent } from './dataspace-form/dataspace-form.component';
import { TenantFormComponent } from './tenant-form/tenant-form.component';
import { generateParticipantDid } from '../util/did.util';
import { isTenantDeployed } from '../util/deployment.util';
import { REDLINE_CONFIG } from '../redline.config';

/** Agent states that are considered terminal for deployment polling. */
const TERMINAL_AGENT_STATES = ['ACTIVE', 'ERROR', 'FAILED', 'DISPOSED'];

/** Interval between participant status polls, in milliseconds. */
const POLL_INTERVAL_MS = 500;

/** Maximum number of status polls before giving up (~60s at 500ms). */
const MAX_POLL_ATTEMPTS = 120;

/** View mode: deployed tenants vs. open (not-yet-deployed) registrations. */
export type TenantViewMode = 'deployed' | 'open';

/**
 * Operator view for managing the Redline tenant hierarchy:
 * service providers, dataspaces, tenants and participants.
 *
 * The same component backs two routes, distinguished by the `mode` route data:
 *  - `deployed`: tenants that have at least one deployed participant agent.
 *  - `open`: open registrations — tenants registered but not yet deployed.
 */
@Component({
  selector: 'tenant-view',
  standalone: true,
  imports: [
    FormsModule,
    FilterInputComponent,
    ItemCountSelectorComponent,
    PaginationComponent,
    TenantCardComponent,
  ],
  templateUrl: './tenant-view.component.html',
})
export class TenantViewComponent implements OnInit, OnDestroy {
  private readonly redline = inject(RedlineService);
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly config = inject(REDLINE_CONFIG);
  private readonly route = inject(ActivatedRoute);

  /**
   * Which slice of tenants this instance shows, read from the route's `data`.
   * Defaults to `deployed` when not provided.
   */
  readonly mode = signal<TenantViewMode>(
    (this.route.snapshot.data['mode'] as TenantViewMode) ?? 'deployed',
  );

  /** Active deployment-status poll timers, keyed by participant ID. */
  private readonly pollTimers = new Map<number, ReturnType<typeof setTimeout>>();

  /** IDs of participants currently being polled, exposed to the cards. */
  readonly pollingParticipantIds = signal<ReadonlySet<number>>(new Set<number>());

  readonly serviceProviders = signal<ServiceProviderResponse[]>([]);
  readonly dataspaces = signal<DataspaceResponse[]>([]);
  readonly tenants = signal<Tenant[]>([]);
  readonly selectedProviderId = signal<number | null>(null);
  readonly filterText = signal('');
  readonly fetched = signal(false);

  pageItemCount = 15;
  readonly pageTenants = signal<Tenant[]>([]);

  readonly filteredTenants = computed(() => {
    const text = this.filterText().trim().toLowerCase();
    const tenants = this.tenants();
    if (!text) {
      return tenants;
    }
    return tenants.filter(
      tenant =>
        tenant.name?.toLowerCase().includes(text) ||
        String(tenant.id).includes(text) ||
        tenant.participants?.some(p => p.identifier?.toLowerCase().includes(text)),
    );
  });

  /**
   * Tenants matching the current filter, partitioned by {@link mode}. The
   * `deployed` mode keeps fully-deployed tenants (every participant agent
   * `ACTIVE`); the `open` mode keeps the rest (registered, not yet deployed).
   */
  readonly visibleTenants = computed(() => {
    const deployedMode = this.mode() === 'deployed';
    return this.filteredTenants().filter(
      tenant => isTenantDeployed(tenant) === deployedMode,
    );
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadServiceProviders(), this.loadDataspaces()]);
  }

  ngOnDestroy(): void {
    for (const timer of this.pollTimers.values()) {
      clearTimeout(timer);
    }
    this.pollTimers.clear();
  }

  private async loadServiceProviders(): Promise<void> {
    try {
      const providers = await this.redline.getServiceProviders();
      this.serviceProviders.set(providers);
      if (providers.length > 0 && this.selectedProviderId() === null) {
        await this.selectProvider(providers[0].id);
      }
    } catch (error) {
      this.showError('Failed to load service providers', error);
    }
  }

  private async loadDataspaces(): Promise<void> {
    try {
      this.dataspaces.set(await this.redline.getDataspaces());
    } catch (error) {
      this.showError('Failed to load dataspaces', error);
    }
  }

  async selectProvider(providerId: number | null): Promise<void> {
    this.selectedProviderId.set(providerId);
    if (providerId === null) {
      this.tenants.set([]);
      this.fetched.set(true);
      return;
    }
    await this.loadTenants(providerId);
  }

  onProviderChange(value: string): void {
    void this.selectProvider(value ? Number(value) : null);
  }

  private async loadTenants(providerId: number): Promise<void> {
    this.fetched.set(false);
    try {
      const tenants = await this.redline.listTenants(providerId);
      this.tenants.set(tenants ?? []);
    } catch (error) {
      this.tenants.set([]);
      this.showError('Failed to load tenants', error);
    } finally {
      this.fetched.set(true);
    }
  }

  async refreshTenants(): Promise<void> {
    const providerId = this.selectedProviderId();
    if (providerId !== null) {
      await this.loadTenants(providerId);
    }
  }

  filter(searchText: string): void {
    this.filterText.set(searchText);
  }

  paginationEvent(pageItems: Tenant[]): void {
    this.pageTenants.set(pageItems);
  }

  // --- Create actions ------------------------------------------------------

  openCreateProvider(): void {
    this.modalAndAlert.openModal(
      ServiceProviderFormComponent,
      {},
      {
        save: (provider: ServiceProvider) => void this.createProvider(provider),
        cancel: () => this.modalAndAlert.closeModal(),
      },
      true,
    );
  }

  private async createProvider(provider: ServiceProvider): Promise<void> {
    this.modalAndAlert.closeModal();
    try {
      const created = await this.redline.createServiceProvider(provider);
      this.serviceProviders.update(list => [...list, created]);
      await this.selectProvider(created.id);
      this.modalAndAlert.showAlert(
        `Service provider "${created.name}" created.`,
        'Success',
        'success',
        5,
      );
    } catch (error) {
      this.showError('Failed to create service provider', error);
    }
  }

  openCreateDataspace(): void {
    this.modalAndAlert.openModal(
      DataspaceFormComponent,
      {},
      {
        save: (dataspace: DataspaceRequest) => void this.createDataspace(dataspace),
        cancel: () => this.modalAndAlert.closeModal(),
      },
      true,
    );
  }

  private async createDataspace(dataspace: DataspaceRequest): Promise<void> {
    this.modalAndAlert.closeModal();
    try {
      const created = await this.redline.createDataspace(dataspace);
      this.dataspaces.update(list => [...list, created]);
      this.modalAndAlert.showAlert(
        `Dataspace "${created.name}" created.`,
        'Success',
        'success',
        5,
      );
    } catch (error) {
      this.showError('Failed to create dataspace', error);
    }
  }

  openRegisterTenant(): void {
    const providerId = this.selectedProviderId();
    if (providerId === null) {
      return;
    }
    this.modalAndAlert.openModal(
      TenantFormComponent,
      { dataspaces: this.dataspaces() },
      {
        save: (registration: TenantRegistration) =>
          void this.registerTenant(providerId, registration),
        cancel: () => this.modalAndAlert.closeModal(),
      },
      true,
    );
  }

  private async registerTenant(
    providerId: number,
    registration: TenantRegistration,
  ): Promise<void> {
    this.modalAndAlert.closeModal();
    try {
      await this.redline.registerTenant(providerId, registration);
      await this.loadTenants(providerId);
      this.modalAndAlert.showAlert(
        `Tenant "${registration.tenantName}" registered.`,
        'Success',
        'success',
        5,
      );
    } catch (error) {
      this.showError('Failed to register tenant', error);
    }
  }

  // --- Participant actions -------------------------------------------------

  async deployParticipant(tenant: Tenant, participant: Participant): Promise<void> {
    const providerId = this.selectedProviderId();
    if (providerId === null) {
      return;
    }
    try {
      // The participant is deployed with a did:web identifier derived from the
      // tenant name.
      const identifier = generateParticipantDid(tenant.name, this.config.didPrefix) || participant.identifier;
      await this.redline.deployParticipant(providerId, tenant.id, participant.id, {
        participantId: participant.id,
        identifier,
      });
      await this.loadTenants(providerId);
      this.modalAndAlert.showAlert(
        `Participant "${identifier}" deployment triggered.`,
        'Success',
        'success',
        5,
      );
      this.startPollingParticipant(providerId, tenant.id, participant.id);
    } catch (error) {
      this.showError('Failed to deploy participant', error);
    }
  }

  /**
   * Polls a participant's status every {@link POLL_INTERVAL_MS} after a
   * deployment, updating its agents live in the view until every agent reaches
   * a terminal state ({@link TERMINAL_AGENT_STATES}) or the attempt cap is hit.
   */
  private startPollingParticipant(
    providerId: number,
    tenantId: number,
    participantId: number,
  ): void {
    // Cancel any in-flight poll for this participant before starting a new one.
    this.stopPollingParticipant(participantId);

    let attempts = 0;
    const poll = async (): Promise<void> => {
      attempts += 1;
      try {
        const participant = await this.redline.getParticipant(
          providerId,
          tenantId,
          participantId,
        );
        this.updateParticipantInTenants(tenantId, participant);

        if (this.allAgentsTerminal(participant) || attempts >= MAX_POLL_ATTEMPTS) {
          this.stopPollingParticipant(participantId);
          return;
        }
      } catch (error) {
        this.stopPollingParticipant(participantId);
        this.showError('Failed to poll participant status', error);
        return;
      }
      this.pollTimers.set(participantId, setTimeout(() => void poll(), POLL_INTERVAL_MS));
    };

    this.pollTimers.set(participantId, setTimeout(() => void poll(), POLL_INTERVAL_MS));
    this.markPolling(participantId, true);
  }

  /** Stops and clears any active poll timer for the given participant. */
  private stopPollingParticipant(participantId: number): void {
    const timer = this.pollTimers.get(participantId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.pollTimers.delete(participantId);
    }
    this.markPolling(participantId, false);
  }

  /** Adds or removes a participant ID from the polling-state signal. */
  private markPolling(participantId: number, polling: boolean): void {
    this.pollingParticipantIds.update(ids => {
      const next = new Set(ids);
      if (polling) {
        next.add(participantId);
      } else {
        next.delete(participantId);
      }
      return next;
    });
  }

  /** Whether every agent of a participant has reached a terminal state. */
  private allAgentsTerminal(participant: Participant): boolean {
    const agents = participant.agents ?? [];
    if (agents.length === 0) {
      return true;
    }
    return agents.every(agent =>
      TERMINAL_AGENT_STATES.includes((agent.state ?? '').toUpperCase()),
    );
  }

  /** Immutably replaces a participant within the loaded tenants signal. */
  private updateParticipantInTenants(tenantId: number, participant: Participant): void {
    const replace = (tenant: Tenant): Tenant => {
      if (tenant.id !== tenantId) {
        return tenant;
      }
      return {
        ...tenant,
        participants: tenant.participants?.map(existing =>
          existing.id === participant.id ? participant : existing,
        ),
      };
    };
    this.tenants.update(tenants => tenants.map(replace));
    // Keep the currently displayed page in sync so the card re-renders live.
    this.pageTenants.update(tenants => tenants.map(replace));
  }

  async registerDataPlane(tenant: Tenant, participant: Participant): Promise<void> {
    const providerId = this.selectedProviderId();
    if (providerId === null) {
      return;
    }
    try {
      await this.redline.registerDataPlane(providerId, tenant.id, participant.id);
      this.modalAndAlert.showAlert(
        `Data plane registered for "${participant.identifier}".`,
        'Success',
        'success',
        5,
      );
    } catch (error) {
      this.showError('Failed to register data plane', error);
    }
  }

  private showError(title: string, error: unknown): void {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    this.modalAndAlert.showAlert(message, title, 'error', 8);
  }
}
