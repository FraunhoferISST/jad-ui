import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import {
  PartnerReference,
  PartnerReferenceRequest,
  TenantParticipantResource,
  TenantResource,
} from '../../models/redline-data.model';
import { ParticipantContextService } from '../../services/participant-context.service';
import { PartnerService } from '../../services/partner.service';

interface PartnerParticipantOption {
  tenantId: number;
  participantId: number;
  tenantName: string;
  participantIdentifier: string;
  displayName: string;
}

@Component({
  selector: 'participant-partners-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './partners-list.component.html',
})
export class PartnersListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly partnerService = inject(PartnerService);
  private readonly participantContext = inject(ParticipantContextService);

  readonly form = this.fb.nonNullable.group({
    selectedParticipantIds: [[] as string[]],
  });

  loading = true;
  addingPartners = false;
  partnerSearch = '';
  participantSearch = '';

  partners: PartnerReference[] = [];
  filteredPartners: PartnerReference[] = [];
  participantOptions: PartnerParticipantOption[] = [];

  constructor() {
    void this.loadData();
  }

  async refresh(): Promise<void> {
    await this.loadData();
  }

  filterPartners(value: string): void {
    this.partnerSearch = value;
    this.applyPartnerFilter();
  }

  filterParticipants(value: string): void {
    this.participantSearch = value;
  }

  getFilteredParticipants(): PartnerParticipantOption[] {
    const query = this.participantSearch.trim().toLowerCase();
    if (!query) {
      return this.participantOptions;
    }

    return this.participantOptions.filter(option => {
      const identifier = option.participantIdentifier.toLowerCase();
      const tenant = option.tenantName.toLowerCase();
      return identifier.includes(query) || tenant.includes(query);
    });
  }

  getSelectedParticipantIds(): string[] {
    return this.form.controls.selectedParticipantIds.value;
  }

  isParticipantSelected(identifier: string): boolean {
    return this.getSelectedParticipantIds().includes(identifier);
  }

  toggleParticipantSelection(identifier: string): void {
    const selected = this.getSelectedParticipantIds();
    const next = selected.includes(identifier)
      ? selected.filter(item => item !== identifier)
      : [...selected, identifier];

    this.form.patchValue({ selectedParticipantIds: next });
  }

  clearSelection(): void {
    this.form.patchValue({ selectedParticipantIds: [] });
  }

  getSelectedParticipantLabels(): string[] {
    const selected = this.getSelectedParticipantIds();
    return this.participantOptions
      .filter(option => selected.includes(option.participantIdentifier))
      .map(option => option.displayName);
  }

  async addSelectedPartners(): Promise<void> {
    const selected = this.getSelectedParticipantIds();
    if (selected.length === 0 || this.addingPartners) {
      return;
    }

    this.addingPartners = true;
    let createdCount = 0;
    const failedIdentifiers: string[] = [];

    try {
      for (const option of this.participantOptions) {
        if (!selected.includes(option.participantIdentifier)) {
          continue;
        }

        const request: PartnerReferenceRequest = {
          identifier: option.participantIdentifier,
          nickname: option.displayName,
        };

        try {
          await this.partnerService.addPartner(request);
          createdCount += 1;
        } catch {
          failedIdentifiers.push(option.participantIdentifier);
        }
      }

      if (createdCount > 0) {
        this.modalAndAlert.showAlert(
          `Added ${createdCount} partner(s).`,
          'Partner update',
          'success',
          6,
        );
      }

      if (failedIdentifiers.length > 0) {
        this.modalAndAlert.showAlert(
          `Could not add: ${failedIdentifiers.join(', ')}.`,
          'Partner update',
          'warning',
          8,
        );
      }

      await this.loadData();
      this.clearSelection();
      this.participantSearch = '';
    } finally {
      this.addingPartners = false;
    }
  }

  showRemoveUnsupported(): void {
    this.modalAndAlert.showAlert(
      'Removing partners is currently unavailable because the Redline API has no delete partner endpoint.',
      'Remove partner',
      'info',
      8,
    );
  }

  private async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [partners, tenants, context] = await Promise.all([
        this.partnerService.getPartners(),
        this.partnerService.getAllTenants(),
        this.participantContext.resolve(),
      ]);

      this.partners = [...partners].sort((a, b) =>
        (a.nickname ?? a.identifier).localeCompare(b.nickname ?? b.identifier),
      );
      this.applyPartnerFilter();

      const existingPartnerIds = new Set(this.partners.map(item => item.identifier));
      this.participantOptions = this.mapParticipantOptions(
        tenants,
        context.participantIdentifier,
        existingPartnerIds,
      );
    } catch (error) {
      this.partners = [];
      this.filteredPartners = [];
      this.participantOptions = [];
      const message = error instanceof Error ? error.message : 'Failed to load partners.';
      this.modalAndAlert.showAlert(message, 'Partners', 'error', 8);
    } finally {
      this.loading = false;
    }
  }

  private applyPartnerFilter(): void {
    const query = this.partnerSearch.trim().toLowerCase();
    if (!query) {
      this.filteredPartners = this.partners;
      return;
    }

    this.filteredPartners = this.partners.filter(partner => {
      const nickname = (partner.nickname ?? '').toLowerCase();
      const identifier = partner.identifier.toLowerCase();
      return nickname.includes(query) || identifier.includes(query);
    });
  }

  private mapParticipantOptions(
    tenants: TenantResource[],
    currentParticipantIdentifier: string,
    existingPartnerIds: Set<string>,
  ): PartnerParticipantOption[] {
    const options: PartnerParticipantOption[] = [];

    for (const tenant of tenants) {
      const participants = tenant.participants ?? [];
      for (const participant of participants) {
        this.appendParticipantOption(
          options,
          tenant,
          participant,
          currentParticipantIdentifier,
          existingPartnerIds,
        );
      }
    }

    return options.sort((a, b) => {
      if (a.tenantName !== b.tenantName) {
        return a.tenantName.localeCompare(b.tenantName);
      }
      return a.participantIdentifier.localeCompare(b.participantIdentifier);
    });
  }

  private appendParticipantOption(
    options: PartnerParticipantOption[],
    tenant: TenantResource,
    participant: TenantParticipantResource,
    currentParticipantIdentifier: string,
    existingPartnerIds: Set<string>,
  ): void {
    const identifier = participant.identifier?.trim();
    if (!identifier || identifier === currentParticipantIdentifier || existingPartnerIds.has(identifier)) {
      return;
    }

    options.push({
      tenantId: tenant.id,
      participantId: participant.id,
      tenantName: tenant.name,
      participantIdentifier: identifier,
      displayName: `${tenant.name}`,
    });
  }
}
