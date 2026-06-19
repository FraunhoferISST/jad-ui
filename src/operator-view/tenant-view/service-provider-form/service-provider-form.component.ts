import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ServiceProvider } from '../../models/redline.models';

/** Form for creating a new service provider. Rendered inside a modal. */
@Component({
  selector: 'service-provider-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './service-provider-form.component.html',
})
export class ServiceProviderFormComponent {
  /** Emitted with the new service provider when the form is submitted. */
  @Output() save = new EventEmitter<ServiceProvider>();

  /** Emitted when the user cancels the form. */
  @Output() cancel = new EventEmitter<void>();

  name = '';

  submit(): void {
    const name = this.name.trim();
    if (!name) {
      return;
    }
    this.save.emit({ name });
  }
}
