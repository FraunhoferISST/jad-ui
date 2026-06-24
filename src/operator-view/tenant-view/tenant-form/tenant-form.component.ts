import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { JsonObjectInputComponent } from '@eclipse-edc/dashboard-core';

import {
  DataspaceInfo,
  DataspaceResponse,
  TenantRegistration,
} from '../../models/redline.models';
import { atLeastOneDataspaceSelected } from '../../validators/dataspace.validators';
import { generateParticipantDid } from '../../util/did.util';
import { REDLINE_CONFIG } from '../../redline.config';

/**
 * Form for registering a new tenant under a service provider. Allows selecting
 * the dataspaces the tenant's participant should join, along with roles and
 * agreement types per dataspace. Rendered inside a modal.
 */
@Component({
  selector: 'tenant-form',
  standalone: true,
  imports: [ReactiveFormsModule, JsonObjectInputComponent],
  templateUrl: './tenant-form.component.html',
})
export class TenantFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly config = inject(REDLINE_CONFIG);

  /** Dataspaces available for the tenant to join. */
  @Input() dataspaces: DataspaceResponse[] = [];

  /** Emitted with the registration payload when the form is submitted. */
  @Output() save = new EventEmitter<TenantRegistration>();

  /** Emitted when the user cancels the form. */
  @Output() cancel = new EventEmitter<void>();

  readonly form = this.fb.nonNullable.group({
    tenantName: ['', [Validators.required]],
    dataspaces: this.fb.array<FormGroup>([], atLeastOneDataspaceSelected),
  });

  properties: Record<string, any> = {};

  get dataspacesArray(): FormArray<FormGroup> {
    return this.form.controls.dataspaces;
  }

  /**
   * Live DID derived from the currently entered tenant name, shown read-only in
   * the form. This is the `identifier` the participant will be deployed with.
   * Empty while no (non-blank) tenant name has been entered.
   */
  get generatedDid(): string {
    return generateParticipantDid(this.form.controls.tenantName.value, this.config.didPrefix);
  }

  ngOnInit(): void {
    this.dataspaces.forEach(dataspace => {
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
  }

  private splitList(value: string): string[] {
    return value
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0);
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    const tenantName = this.form.controls.tenantName.value.trim();
    if (!tenantName) {
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
    if (Object.keys(this.properties).length > 0) {
      registration.properties = this.properties;
    }
    this.save.emit(registration);
  }
}
