import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  DataspaceInfo,
  DataspaceResponse,
  TenantRegistration,
} from '../../models/redline.models';

interface PropertyRow {
  key: string;
  value: string;
}

interface DataspaceSelection {
  dataspace: DataspaceResponse;
  selected: boolean;
  roles: string;
  agreementTypes: string;
}

/**
 * Form for registering a new tenant under a service provider. Allows selecting
 * the dataspaces the tenant's participant should join, along with roles and
 * agreement types per dataspace. Rendered inside a modal.
 */
@Component({
  selector: 'tenant-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './tenant-form.component.html',
})
export class TenantFormComponent implements OnInit {
  /** Dataspaces available for the tenant to join. */
  @Input() dataspaces: DataspaceResponse[] = [];

  /** Emitted with the registration payload when the form is submitted. */
  @Output() save = new EventEmitter<TenantRegistration>();

  /** Emitted when the user cancels the form. */
  @Output() cancel = new EventEmitter<void>();

  tenantName = '';
  properties: PropertyRow[] = [];
  selections: DataspaceSelection[] = [];

  ngOnInit(): void {
    this.selections = this.dataspaces.map(dataspace => ({
      dataspace,
      selected: false,
      roles: '',
      agreementTypes: '',
    }));
  }

  addProperty(): void {
    this.properties.push({ key: '', value: '' });
  }

  removeProperty(index: number): void {
    this.properties.splice(index, 1);
  }

  private splitList(value: string): string[] {
    return value
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0);
  }

  submit(): void {
    const tenantName = this.tenantName.trim();
    if (!tenantName) {
      return;
    }

    const dataspaceInfos: DataspaceInfo[] = this.selections
      .filter(selection => selection.selected)
      .map(selection => {
        const info: DataspaceInfo = { dataspaceId: selection.dataspace.id };
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

    const properties = this.properties.reduce<Record<string, unknown>>((acc, row) => {
      const key = row.key.trim();
      if (key) {
        acc[key] = row.value;
      }
      return acc;
    }, {});

    const registration: TenantRegistration = { tenantName };
    if (dataspaceInfos.length > 0) {
      registration.dataspaceInfos = dataspaceInfos;
    }
    if (Object.keys(properties).length > 0) {
      registration.properties = properties;
    }
    this.save.emit(registration);
  }
}
