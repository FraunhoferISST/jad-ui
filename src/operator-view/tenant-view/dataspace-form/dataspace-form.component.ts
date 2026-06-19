import { Component, EventEmitter, inject, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { JsonObjectInputComponent } from '@eclipse-edc/dashboard-core';

import { DataspaceRequest } from '../../models/redline.models';

/** Form for creating a new dataspace. Rendered inside a modal. */
@Component({
  selector: 'dataspace-form',
  standalone: true,
  imports: [ReactiveFormsModule, JsonObjectInputComponent],
  templateUrl: './dataspace-form.component.html',
})
export class DataspaceFormComponent {
  private readonly fb = inject(FormBuilder);

  /** Emitted with the new dataspace when the form is submitted. */
  @Output() save = new EventEmitter<DataspaceRequest>();

  /** Emitted when the user cancels the form. */
  @Output() cancel = new EventEmitter<void>();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
  });

  properties: Record<string, any> = {};

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    const name = this.form.controls.name.value.trim();
    if (!name) {
      return;
    }

    const request: DataspaceRequest = { name };
    if (Object.keys(this.properties).length > 0) {
      request.properties = this.properties;
    }
    this.save.emit(request);
  }
}
