import { Component, EventEmitter, inject, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { JsonObjectInputComponent } from '@eclipse-edc/dashboard-core';

import { TenantRegistration } from '../../models/redline.models';
import { generateParticipantDid } from '../../util/did.util';
import { REDLINE_CONFIG } from '../../redline.config';

/** Tenant registration without membership assignment, rendered inside a modal. */
@Component({
  selector: 'tenant-form',
  standalone: true,
  imports: [ReactiveFormsModule, JsonObjectInputComponent],
  templateUrl: './tenant-form.component.html',
})
export class TenantFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly config = inject(REDLINE_CONFIG);

  @Output() save = new EventEmitter<TenantRegistration>();
  @Output() cancel = new EventEmitter<void>();

  readonly form = this.fb.nonNullable.group({
    tenantName: ['', [Validators.required, Validators.pattern(/\S/)]],
  });

  properties: NonNullable<JsonObjectInputComponent['object']> = {};

  get generatedDid(): string {
    return generateParticipantDid(this.form.controls.tenantName.value, this.config.didPrefix);
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }

    const registration: TenantRegistration = {
      tenantName: this.form.controls.tenantName.value.trim(),
    };
    if (Object.keys(this.properties).length > 0) {
      registration.properties = this.properties;
    }
    this.save.emit(registration);
  }
}
