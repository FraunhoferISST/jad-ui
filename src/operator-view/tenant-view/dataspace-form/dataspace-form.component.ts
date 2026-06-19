import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DataspaceRequest } from '../../models/redline.models';

interface PropertyRow {
  key: string;
  value: string;
}

/** Form for creating a new dataspace. Rendered inside a modal. */
@Component({
  selector: 'dataspace-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './dataspace-form.component.html',
})
export class DataspaceFormComponent {
  /** Emitted with the new dataspace when the form is submitted. */
  @Output() save = new EventEmitter<DataspaceRequest>();

  /** Emitted when the user cancels the form. */
  @Output() cancel = new EventEmitter<void>();

  name = '';
  properties: PropertyRow[] = [];

  addProperty(): void {
    this.properties.push({ key: '', value: '' });
  }

  removeProperty(index: number): void {
    this.properties.splice(index, 1);
  }

  submit(): void {
    const name = this.name.trim();
    if (!name) {
      return;
    }

    const properties = this.properties.reduce<Record<string, unknown>>((acc, row) => {
      const key = row.key.trim();
      if (key) {
        acc[key] = row.value;
      }
      return acc;
    }, {});

    const request: DataspaceRequest = { name };
    if (Object.keys(properties).length > 0) {
      request.properties = properties;
    }
    this.save.emit(request);
  }
}
