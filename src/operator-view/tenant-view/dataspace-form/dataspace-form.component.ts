import { Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { JsonObjectInputComponent } from '@eclipse-edc/dashboard-core';

import { DataspaceRequest } from '../../../app/redline/redline.models';

/** Form for creating a new dataspace. Rendered inside a modal. */
@Component({
  selector: 'app-dataspace-form',
  imports: [ReactiveFormsModule, JsonObjectInputComponent],
  templateUrl: './dataspace-form.component.html',
})
export class DataspaceFormComponent {
  private readonly fb = inject(FormBuilder);

  /** Emitted with the new dataspace when the form is submitted. */
  readonly save = output<DataspaceRequest>();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
  });

  properties: NonNullable<JsonObjectInputComponent['object']> = {};

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
