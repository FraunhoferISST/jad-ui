import { Component, computed, inject, OnInit, signal } from '@angular/core';
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

/**
 * Operator view for managing the Redline tenant hierarchy:
 * service providers, dataspaces, tenants and participants.
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
export class TenantViewComponent implements OnInit {
  private readonly redline = inject(RedlineService);
  private readonly modalAndAlert = inject(ModalAndAlertService);

  readonly serviceProviders = signal<ServiceProviderResponse[]>([]);
  readonly dataspaces = signal<DataspaceResponse[]>([]);
  readonly tenants = signal<Tenant[]>([]);
  readonly selectedProviderId = signal<number | null>(null);
  readonly filterText = signal('');
  readonly fetched = signal(false);

  pageItemCount = 12;
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

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadServiceProviders(), this.loadDataspaces()]);
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
      await this.redline.deployParticipant(providerId, tenant.id, participant.id, {
        participantId: participant.id,
        identifier: participant.identifier,
      });
      await this.loadTenants(providerId);
      this.modalAndAlert.showAlert(
        `Participant "${participant.identifier}" deployment triggered.`,
        'Success',
        'success',
        5,
      );
    } catch (error) {
      this.showError('Failed to deploy participant', error);
    }
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
