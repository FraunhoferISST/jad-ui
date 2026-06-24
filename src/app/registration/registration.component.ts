import { Component, inject, OnInit, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { RedlineService } from '../../operator-view/services/redline.service';
import {
  DataspaceInfo,
  DataspaceResponse,
  ServiceProviderResponse,
  TenantRegistration,
} from '../../operator-view/models/redline.models';
import { atLeastOneDataspaceSelected } from '../../operator-view/validators/dataspace.validators';
import { NgClass } from '@angular/common';

/**
 * Public, full-screen tenant-registration request form.
 *
 * Rendered outside the dashboard shell (like the login view) so it is reachable
 * without authentication. The requester picks a service provider, names the
 * tenant and selects the dataspaces to join. The registration is sent to the
 * Redline backend; the operator then sees it under "Open Registrations".
 *
 * Feedback is shown with local signals (not the shell's ModalAndAlertService,
 * which only renders inside the authenticated shell).
 */
@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, NgClass],
  templateUrl: './registration.component.html',
})
export class RegistrationComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly redline = inject(RedlineService);

  protected readonly serviceProviders = signal<ServiceProviderResponse[]>([]);
  protected readonly dataspaces = signal<DataspaceResponse[]>([]);

  protected readonly loadingOptions = signal(true);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submittedName = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    serviceProviderId: [null as number | null, [Validators.required]],
    tenantName: ['', [Validators.required]],
    dataspaces: this.fb.array<FormGroup>([], atLeastOneDataspaceSelected),
  });

  get dataspacesArray(): FormArray<FormGroup> {
    return this.form.controls.dataspaces;
  }

  async ngOnInit(): Promise<void> {
    await this.loadOptions();
  }

  private async loadOptions(): Promise<void> {
    this.loadingOptions.set(true);
    this.error.set(null);
    try {
      const [providers, dataspaces] = await Promise.all([
        this.redline.getServiceProviders(),
        this.redline.getDataspaces(),
      ]);
      this.serviceProviders.set(providers);
      this.dataspaces.set(dataspaces);
      dataspaces.forEach(dataspace => {
        this.dataspacesArray.push(
          this.fb.nonNullable.group({
            dataspaceId: [dataspace.id],
            name: [dataspace.name],
            selected: [false],
            roles: [''],
            agreementTypes: [''],
          }),
        );
      });
    } catch (err) {
      this.error.set(
        err instanceof Error
          ? err.message
          : 'Failed to load registration options. Please try again later.',
      );
    } finally {
      this.loadingOptions.set(false);
    }
  }

  private splitList(value: string): string[] {
    return value
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    const providerId = this.form.controls.serviceProviderId.value;
    const tenantName = this.form.controls.tenantName.value.trim();
    if (providerId === null || !tenantName) {
      return;
    }

    const dataspaceInfos: DataspaceInfo[] = this.dataspacesArray.controls
      .map(group => group.value)
      .filter(selection => selection.selected)
      .map(selection => {
        const info: DataspaceInfo = { dataspaceId: selection.dataspaceId };
        const roles = this.splitList(selection.roles);
        const agreementTypes = this.splitList(selection.agreementTypes);
        if (roles.length > 0) {
          info.roles = roles;
        }
        if (agreementTypes.length > 0) {
          info.agreementTypes = agreementTypes;
        }
        return info;
      });

    const registration: TenantRegistration = { tenantName };
    if (dataspaceInfos.length > 0) {
      registration.dataspaceInfos = dataspaceInfos;
    }

    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.redline.registerTenant(providerId, registration);
      this.submittedName.set(tenantName);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to submit registration.',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
