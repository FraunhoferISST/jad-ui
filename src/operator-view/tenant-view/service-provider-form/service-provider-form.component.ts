import { Component, EventEmitter, inject, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ServiceProvider } from '../../models/redline.models';

/** Form for creating a new service provider. Rendered inside a modal. */
@Component({
  selector: 'service-provider-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './service-provider-form.component.html',
})
export class ServiceProviderFormComponent {
  private readonly fb = inject(FormBuilder);

  /** Emitted with the new service provider when the form is submitted. */
  @Output() save = new EventEmitter<ServiceProvider>();

  /** Emitted when the user cancels the form. */
  @Output() cancel = new EventEmitter<void>();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    const name = this.form.controls.name.value.trim();
    if (!name) {
      return;
    }
    this.save.emit({ name });
  }
}
