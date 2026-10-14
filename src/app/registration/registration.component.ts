import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { RedlineService } from '../../operator-view/services/redline.service';

/**
 * Public tenant-registration request form, rendered outside the dashboard shell.
 * Dataspace membership is managed separately by the tenant admin after onboarding.
 */
@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './registration.component.html',
})
export class RegistrationComponent {
  private readonly fb = inject(FormBuilder);
  private readonly redline = inject(RedlineService);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submittedName = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    tenantName: ['', [Validators.required, Validators.pattern(/\S/)]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    const tenantName = this.form.controls.tenantName.value.trim();

    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.redline.registerTenant({ tenantName });
      this.submittedName.set(tenantName);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to submit registration.');
    } finally {
      this.submitting.set(false);
    }
  }
}
