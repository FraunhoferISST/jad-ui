import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { PartnerReference, Tenant } from '../../../app/redline/redline.models';
import { RedlineService } from '../../../app/redline/redline.service';
import { errorMessage, showError } from '../../../app/utils/show-error';
import { ParticipantContextService } from '../../services/participant-context.service';
import { DataspacePartners, PartnerService } from '../../services/partner.service';

interface PartnerParticipantOption {
  tenantName: string;
  participantIdentifier: string;
}

interface PartnerForm {
  create: boolean;
  identifier: string;
  nickname: string;
  properties: string;
}

type PartnerMessage = { text: string; kind: 'success' | 'warning' | 'error' };

const EMPTY_FORM: PartnerForm = { create: false, identifier: '', nickname: '', properties: '{}' };

@Component({
  selector: 'app-participant-partners-list',
  imports: [RouterLink],
  templateUrl: './partners-list.component.html',
})
export class PartnersListComponent {
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly partnerService = inject(PartnerService);
  private readonly redline = inject(RedlineService);
  private readonly participantContext = inject(ParticipantContextService);

  readonly loading = signal(true);
  readonly addingPartners = signal(false);
  readonly partnerSearch = signal('');
  readonly participantSearch = signal('');
  readonly tenants = signal<Tenant[]>([]);
  readonly selfIdentifier = signal('');
  readonly groups = signal<DataspacePartners[]>([]);
  readonly selectedParticipants = signal<ReadonlySet<string>>(new Set());

  /** Registered participants that are not yet partners in the target dataspace. */
  readonly participantOptions = computed(() =>
    this.mapParticipantOptions(
      this.tenants(),
      this.selfIdentifier(),
      this.partnerIdentifiers(this.targetDataspace()?.partners ?? []),
    ),
  );

  readonly tenantNames = computed(() => this.mapTenantNames(this.tenants()));

  /** Dataspace that new partner references are written to. */
  readonly targetDataspace = linkedSignal<DataspacePartners[], DataspacePartners | null>({
    source: this.groups,
    computation: (groups, previous) =>
      groups.find((group) => group.dataspace.id === previous?.value?.dataspace.id) ??
      groups[0] ??
      null,
  });

  /** Form and result message per dataspace; both are keyed by dataspace ID. */
  private readonly forms = signal<Record<number, PartnerForm>>({});
  private readonly messages = signal<Record<number, PartnerMessage>>({});

  readonly filteredGroups = computed(() => {
    const query = this.partnerSearch().trim().toLowerCase();
    return this.groups()
      .map((group) => ({
        ...group,
        partners: group.partners.filter(
          (partner) =>
            (partner.nickname ?? '').toLowerCase().includes(query) ||
            partner.identifier.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => !query || group.partners.length > 0);
  });

  readonly filteredParticipants = computed(() => {
    const query = this.participantSearch().trim().toLowerCase();
    return this.participantOptions().filter(
      (option) =>
        option.participantIdentifier.toLowerCase().includes(query) ||
        option.tenantName.toLowerCase().includes(query),
    );
  });

  readonly selectedParticipantLabels = computed(() => {
    const selected = this.selectedParticipants();
    return this.participantOptions()
      .filter((option) => selected.has(option.participantIdentifier))
      .map((option) => option.tenantName);
  });

  constructor() {
    void this.loadData();
  }

  /** Display name of a partner, from the Redline tenant it belongs to. */
  partnerName(identifier: string): string {
    return this.tenantNames().get(identifier) ?? identifier;
  }

  form(dataspaceId: number): PartnerForm {
    return this.forms()[dataspaceId] ?? EMPTY_FORM;
  }

  message(dataspaceId: number): PartnerMessage | null {
    return this.messages()[dataspaceId] ?? null;
  }

  updateForm(dataspaceId: number, patch: Partial<PartnerForm>): void {
    this.forms.update((forms) => ({
      ...forms,
      [dataspaceId]: { ...(forms[dataspaceId] ?? EMPTY_FORM), ...patch },
    }));
  }

  toggleParticipantSelection(identifier: string): void {
    this.selectedParticipants.update((current) => {
      const next = new Set(current);
      if (next.has(identifier)) next.delete(identifier);
      else next.add(identifier);
      return next;
    });
  }

  clearSelection(): void {
    this.selectedParticipants.set(new Set());
  }

  selectTargetDataspace(dataspaceId: number): void {
    const group = this.groups().find((entry) => entry.dataspace.id === dataspaceId);
    if (!group || group.dataspace.id === this.targetDataspace()?.dataspace.id) return;
    this.targetDataspace.set(group);
    // Availability differs per dataspace, so a stale selection could add duplicates.
    this.clearSelection();
  }

  async addSelectedPartners(): Promise<void> {
    const selected = this.selectedParticipants();
    const dataspaceId = this.targetDataspace()?.dataspace.id;
    if (!selected.size || dataspaceId === undefined || this.addingPartners()) return;

    this.addingPartners.set(true);
    const created: string[] = [];
    const failed: string[] = [];
    try {
      for (const option of this.participantOptions()) {
        if (!selected.has(option.participantIdentifier)) continue;
        try {
          await this.partnerService.addPartner(dataspaceId, {
            identifier: option.participantIdentifier,
            nickname: option.tenantName,
          });
          created.push(option.participantIdentifier);
        } catch (error) {
          failed.push(`${option.participantIdentifier} (${errorMessage(error)})`);
        }
      }
      this.messages.update((messages) => ({
        ...messages,
        [dataspaceId]: {
          text: [
            created.length ? `${created.length} partner(s) added.` : '',
            failed.length ? `Could not add ${failed.join(', ')}.` : '',
          ]
            .filter(Boolean)
            .join(' '),
          kind: failed.length ? (created.length ? 'warning' : 'error') : 'success',
        },
      }));

      await this.loadData();
      // Keep the selection after a failure so the user can retry without re-selecting.
      if (!failed.length) this.clearSelection();
    } finally {
      this.addingPartners.set(false);
    }
  }

  /** Creates a partner that is not a registered Redline participant. */
  async addPartnerManually(dataspaceId: number): Promise<void> {
    const form = this.form(dataspaceId);
    const identifier = form.identifier.trim();
    if (!identifier) {
      this.showMessage(dataspaceId, 'Enter a partner identifier.', 'error');
      return;
    }

    let properties: Record<string, unknown>;
    try {
      const parsed: unknown = form.properties.trim() ? JSON.parse(form.properties) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Properties must be a JSON object.');
      }
      properties = parsed as Record<string, unknown>;
    } catch (error) {
      this.showMessage(dataspaceId, errorMessage(error, 'Invalid properties JSON.'), 'error');
      return;
    }

    if (this.addingPartners()) return;
    this.addingPartners.set(true);
    try {
      await this.partnerService.addPartner(dataspaceId, {
        identifier,
        ...(form.nickname.trim() ? { nickname: form.nickname.trim() } : {}),
        ...(Object.keys(properties).length ? { properties } : {}),
      });
      this.updateForm(dataspaceId, EMPTY_FORM);
      await this.loadData();
      this.showMessage(dataspaceId, `Added ${identifier}.`, 'success');
    } catch (error) {
      this.showMessage(
        dataspaceId,
        `Could not add ${identifier} — ${errorMessage(error)}`,
        'error',
      );
    } finally {
      this.addingPartners.set(false);
    }
  }

  toggleManualCreate(dataspaceId: number): void {
    this.updateForm(dataspaceId, { create: !this.form(dataspaceId).create });
    this.messages.update((messages) => {
      const remaining = { ...messages };
      delete remaining[dataspaceId];
      return remaining;
    });
  }

  showRemoveUnsupported(): void {
    this.modalAndAlert.showAlert(
      'Removing partners is currently unavailable because the Redline API has no delete partner endpoint.',
      'Remove partner',
      'info',
      8,
    );
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const [groups, tenants, context] = await Promise.all([
        this.partnerService.getDataspacePartners(),
        this.redline.listTenants(),
        this.participantContext.resolve(),
      ]);
      this.groups.set(
        groups.map((group) => ({
          ...group,
          partners: [...group.partners].sort((a, b) =>
            (a.nickname ?? a.identifier).localeCompare(b.nickname ?? b.identifier),
          ),
        })),
      );
      this.tenants.set(tenants);
      this.selfIdentifier.set(context.participantIdentifier);
    } catch (error) {
      this.groups.set([]);
      this.tenants.set([]);
      showError(this.modalAndAlert, error, 'Partners');
    } finally {
      this.loading.set(false);
    }
  }

  private partnerIdentifiers(partners: PartnerReference[]): Set<string> {
    return new Set(partners.map((partner) => partner.identifier).filter(Boolean));
  }

  private showMessage(dataspaceId: number, text: string, kind: PartnerMessage['kind']): void {
    this.messages.update((messages) => ({ ...messages, [dataspaceId]: { text, kind } }));
  }

  private mapTenantNames(tenants: Tenant[]): ReadonlyMap<string, string> {
    const names = new Map<string, string>();
    for (const tenant of tenants) {
      for (const participant of tenant.participants ?? []) {
        const identifier = participant.identifier?.trim();
        if (identifier) names.set(identifier, tenant.name);
      }
    }
    return names;
  }

  private mapParticipantOptions(
    tenants: Tenant[],
    currentParticipantIdentifier: string,
    existingPartnerIds: Set<string>,
  ): PartnerParticipantOption[] {
    const options: PartnerParticipantOption[] = [];
    for (const tenant of tenants) {
      for (const participant of tenant.participants ?? []) {
        const identifier = participant.identifier?.trim();
        if (
          !identifier ||
          identifier === currentParticipantIdentifier ||
          existingPartnerIds.has(identifier)
        )
          continue;
        options.push({ tenantName: tenant.name, participantIdentifier: identifier });
      }
    }
    return options.sort(
      (a, b) =>
        a.tenantName.localeCompare(b.tenantName) ||
        a.participantIdentifier.localeCompare(b.participantIdentifier),
    );
  }
}
