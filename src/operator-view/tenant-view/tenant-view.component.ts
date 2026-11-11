import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  FilterInputComponent,
  ItemCountSelectorComponent,
  ModalAndAlertService,
  PaginationComponent,
} from '@eclipse-edc/dashboard-core';

import { RedlineService } from '../../app/redline/redline.service';
import {
  DataspaceRequest,
  DataspaceResponse,
  Participant,
  Tenant,
  TenantRegistration,
} from '../../app/redline/redline.models';
import { TenantCardComponent } from './tenant-card/tenant-card.component';
import { DataspaceFormComponent } from './dataspace-form/dataspace-form.component';
import { TenantFormComponent } from './tenant-form/tenant-form.component';
import { generateParticipantDid } from '../util/did.util';
import { isTenantDeployed } from '../util/deployment.util';
import { REDLINE_CONFIG } from '../../app/redline/redline.config';
import { showError } from '../../app/utils/show-error';
import { pollUntil } from '../../app/utils/poll-until';

/** Agent states that are considered terminal for deployment polling. */
const TERMINAL_AGENT_STATES = ['ACTIVE', 'ERROR', 'FAILED', 'DISPOSED'];

/** Interval between participant status polls, in milliseconds. */
const POLL_INTERVAL_MS = 500;

/** Maximum number of status polls before giving up (~60s at 500ms). */
const MAX_POLL_ATTEMPTS = 120;

/** View mode: deployed tenants vs. open (not-yet-deployed) registrations. */
type TenantViewMode = 'deployed' | 'open';

/**
 * Operator view for managing the Redline tenant hierarchy:
 * dataspaces, tenants and participants under the seeded service provider.
 *
 * The same component backs two routes, distinguished by the `mode` route data:
 *  - `deployed`: tenants that have at least one deployed participant agent.
 *  - `open`: open registrations — tenants registered but not yet deployed.
 */
@Component({
  selector: 'app-tenant-view',
  imports: [
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
  readonly mode: TenantViewMode =
    (this.route.snapshot.data['mode'] as TenantViewMode) ?? 'deployed';

  /** Active deployment-status polls, keyed by participant ID. */
  private readonly polls = new Map<number, AbortController>();

  /** IDs of participants currently being polled, exposed to the cards. */
  readonly pollingParticipantIds = signal<ReadonlySet<number>>(new Set<number>());

  readonly dataspaces = signal<DataspaceResponse[]>([]);
  readonly tenants = signal<Tenant[]>([]);
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
      (tenant) =>
        tenant.name?.toLowerCase().includes(text) ||
        String(tenant.id).includes(text) ||
        tenant.participants?.some((p) => p.identifier?.toLowerCase().includes(text)),
    );
  });

  /**
   * Tenants matching the current filter, partitioned by {@link mode}. The
   * `deployed` mode keeps fully-deployed tenants (every participant agent
   * `ACTIVE`); the `open` mode keeps the rest (registered, not yet deployed).
   */
  readonly visibleTenants = computed(() => {
    const deployedMode = this.mode === 'deployed';
    return this.filteredTenants().filter((tenant) => isTenantDeployed(tenant) === deployedMode);
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadTenants(), this.loadDataspaces()]);
  }

  ngOnDestroy(): void {
    for (const poll of this.polls.values()) poll.abort();
    this.polls.clear();
    this.pollingParticipantIds.set(new Set());
  }

  private async loadDataspaces(): Promise<void> {
    try {
      this.dataspaces.set(await this.redline.getDataspaces());
    } catch (error) {
      this.showError('Failed to load dataspaces', error);
    }
  }

  private async loadTenants(): Promise<void> {
    this.fetched.set(false);
    try {
      const tenants = await this.redline.listTenants();
      this.tenants.set(tenants ?? []);
    } catch (error) {
      this.tenants.set([]);
      this.showError('Failed to load tenants', error);
    } finally {
      this.fetched.set(true);
    }
  }

  filter(searchText: string): void {
    this.filterText.set(searchText);
  }

  paginationEvent(pageItems: Tenant[]): void {
    this.pageTenants.set(pageItems);
  }

  // --- Create actions ------------------------------------------------------

  openCreateDataspace(): void {
    this.modalAndAlert.openModal(
      DataspaceFormComponent,
      {},
      {
        save: (dataspace: DataspaceRequest) => void this.createDataspace(dataspace),
      },
      true,
    );
  }

  private async createDataspace(dataspace: DataspaceRequest): Promise<void> {
    this.modalAndAlert.closeModal();
    try {
      const created = await this.redline.createDataspace(dataspace);
      this.dataspaces.update((list) => [...list, created]);
      this.modalAndAlert.showAlert(`Dataspace "${created.name}" created.`, 'Success', 'success', 5);
    } catch (error) {
      this.showError('Failed to create dataspace', error);
    }
  }

  openRegisterTenant(): void {
    this.modalAndAlert.openModal(
      TenantFormComponent,
      {},
      {
        save: (registration: TenantRegistration) => void this.registerTenant(registration),
      },
      true,
    );
  }

  private async registerTenant(registration: TenantRegistration): Promise<void> {
    this.modalAndAlert.closeModal();
    try {
      await this.redline.registerTenant(registration);
      await this.loadTenants();
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
    try {
      // The participant is deployed with a did:web identifier derived from the
      // tenant name.
      const identifier =
        generateParticipantDid(tenant.name, this.config.didPrefix) || participant.identifier;
      await this.redline.deployParticipant(tenant.id, participant.id, {
        participantId: participant.id,
        identifier,
      });
      await this.loadTenants();
      this.modalAndAlert.showAlert(
        `Participant "${identifier}" deployment triggered.`,
        'Success',
        'success',
        5,
      );
      this.startPollingParticipant(tenant.id, participant.id);
    } catch (error) {
      this.showError('Failed to deploy participant', error);
    }
  }

  /**
   * Polls a participant's status every {@link POLL_INTERVAL_MS} after a
   * deployment, updating its agents live in the view until every agent reaches
   * a terminal state ({@link TERMINAL_AGENT_STATES}) or the attempt cap is hit.
   */
  private startPollingParticipant(tenantId: number, participantId: number): void {
    this.stopPollingParticipant(participantId);
    const controller = new AbortController();
    this.polls.set(participantId, controller);
    this.markPolling(participantId, true);
    void pollUntil(
      async () => {
        const participant = await this.redline.getParticipant(tenantId, participantId);
        if (controller.signal.aborted) return undefined;
        this.updateParticipantInTenants(tenantId, participant);
        return this.allAgentsTerminal(participant) ? true : undefined;
      },
      {
        intervalMs: POLL_INTERVAL_MS,
        maxAttempts: MAX_POLL_ATTEMPTS,
        initialDelay: true,
        signal: controller.signal,
      },
    )
      .catch((error: unknown) => {
        if (!controller.signal.aborted) this.showError('Failed to poll participant status', error);
      })
      .finally(() => {
        if (this.polls.get(participantId) === controller)
          this.stopPollingParticipant(participantId);
      });
  }

  /** Stops and clears any active poll for the given participant. */
  private stopPollingParticipant(participantId: number): void {
    this.polls.get(participantId)?.abort();
    this.polls.delete(participantId);
    this.markPolling(participantId, false);
  }

  /** Adds or removes a participant ID from the polling-state signal. */
  private markPolling(participantId: number, polling: boolean): void {
    this.pollingParticipantIds.update((ids) => {
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
    return agents.every((agent) =>
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
        participants: tenant.participants?.map((existing) =>
          existing.id === participant.id ? participant : existing,
        ),
      };
    };
    this.tenants.update((tenants) => tenants.map(replace));
    // Keep the currently displayed page in sync so the card re-renders live.
    this.pageTenants.update((tenants) => tenants.map(replace));
  }

  private showError(title: string, error: unknown): void {
    showError(this.modalAndAlert, error, title);
  }
}
