import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidatorFn } from '@angular/forms';

import {
  DataspaceInfo,
  DataspaceResponse,
  Tenant,
} from '../../operator-view/models/redline.models';
import { RedlineService } from '../../operator-view/services/redline.service';
import { ParticipantContextService } from '../services/participant-context.service';

interface DataspaceEntry extends DataspaceResponse {
  membership?: DataspaceInfo;
}

function parseProperties(value: string): Record<string, unknown> | null {
  if (!value.trim()) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const propertiesValidator: ValidatorFn = (control) =>
  parseProperties(control.value) === null ? { jsonObject: true } : null;

@Component({
  selector: 'app-dataspaces',
  standalone: true,
  imports: [ReactiveFormsModule, NgTemplateOutlet],
  templateUrl: './dataspaces.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataspacesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly redline = inject(RedlineService);
  private readonly context = inject(ParticipantContextService);

  protected readonly tenant = signal<Tenant | null>(null);
  private readonly availableDataspaces = signal<DataspaceResponse[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly editing = signal<DataspaceEntry | null>(null);
  protected readonly pendingLeave = signal<number | null>(null);
  protected readonly availableSearch = signal('');
  protected readonly joinedSearch = signal('');
  protected readonly selectedDataspace = computed(() => {
    const entry = this.editing();
    return entry && !entry.membership ? entry : null;
  });

  // Membership endpoints act on the tenant, not just the logged-in participant.
  protected readonly entries = computed<DataspaceEntry[]>(() => {
    const memberships = this.tenant()?.participants?.flatMap((p) => p.dataspaceInfos ?? []) ?? [];
    const dataspaces = new Map(this.availableDataspaces().map((ds) => [ds.id, ds]));
    for (const info of memberships) {
      if (!dataspaces.has(info.dataspaceId)) {
        dataspaces.set(info.dataspaceId, {
          id: info.dataspaceId,
          name: `Dataspace #${info.dataspaceId}`,
        });
      }
    }
    return [...dataspaces.values()].map((ds) => ({
      ...ds,
      membership: memberships.find((info) => info.dataspaceId === ds.id),
    }));
  });

  protected readonly unjoinedEntries = computed(() =>
    this.filterEntries(
      this.entries().filter((entry) => !entry.membership),
      this.availableSearch(),
    ),
  );
  protected readonly joinedEntries = computed(() =>
    this.filterEntries(
      this.entries().filter((entry) => entry.membership),
      this.joinedSearch(),
    ),
  );

  // Match the application's existing reactive-form convention.
  protected readonly form = this.fb.nonNullable.group({
    roles: [''],
    agreementTypes: [''],
    properties: ['{}', propertiesValidator],
  });

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  protected async refresh(): Promise<void> {
    if (this.loading() || this.busy()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.editing.set(null);
    this.pendingLeave.set(null);
    this.tenant.set(null);
    this.availableDataspaces.set([]);
    try {
      const [context, dataspaces] = await Promise.all([
        this.context.resolve(),
        this.redline.getDataspaces(),
      ]);
      const tenant = await this.redline.getTenant(context.tenantId);
      this.availableDataspaces.set(dataspaces);
      this.tenant.set(tenant);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Failed to load dataspaces. Please retry.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleDataspaceSelection(entry: DataspaceEntry): void {
    if (!this.tenant() || this.loading() || this.busy() || entry.membership) {
      return;
    }
    if (this.selectedDataspace()?.id === entry.id) {
      this.cancelEdit();
    } else {
      this.edit(entry);
    }
  }

  protected edit(entry: DataspaceEntry): void {
    if (this.loading() || this.busy()) {
      return;
    }
    this.error.set(null);
    this.success.set(null);
    this.pendingLeave.set(null);
    this.form.reset({
      roles: entry.membership?.roles?.join(', ') ?? '',
      agreementTypes: entry.membership?.agreementTypes?.join(', ') ?? '',
      properties: JSON.stringify(entry.membership?.properties ?? {}, null, 2),
    });
    this.editing.set(entry);
  }

  protected cancelEdit(): void {
    if (!this.busy()) {
      this.editing.set(null);
    }
  }

  protected async save(): Promise<void> {
    const tenant = this.tenant();
    const entry = this.editing();
    if (!tenant || !entry || this.loading() || this.busy() || this.form.invalid) {
      return;
    }
    const values = this.form.getRawValue();
    const properties = parseProperties(values.properties);
    if (properties === null) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      // POST resets omitted metadata. Always send every editable field so edits
      // retain existing values and clearing a field explicitly sends an empty value.
      const updated = await this.redline.onboardTenantToDataspace(tenant.id, {
        dataspaceId: entry.id,
        roles: this.splitList(values.roles),
        agreementTypes: this.splitList(values.agreementTypes),
        properties,
      });
      this.tenant.set(updated);
      this.editing.set(null);
      this.success.set(
        entry.membership
          ? `Membership for "${entry.name}" updated.`
          : `Tenant joined "${entry.name}".`,
      );
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Failed to save dataspace membership.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected requestLeave(entry: DataspaceEntry): void {
    if (this.loading() || this.busy() || !entry.membership) {
      return;
    }
    this.editing.set(null);
    this.error.set(null);
    this.success.set(null);
    this.pendingLeave.set(entry.id);
  }

  protected cancelLeave(): void {
    if (!this.busy()) {
      this.pendingLeave.set(null);
    }
  }

  protected async leave(entry: DataspaceEntry): Promise<void> {
    const tenant = this.tenant();
    if (
      !tenant ||
      !entry.membership ||
      this.pendingLeave() !== entry.id ||
      this.loading() ||
      this.busy()
    ) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      this.tenant.set(await this.redline.offboardTenantFromDataspace(tenant.id, entry.id));
      this.pendingLeave.set(null);
      this.success.set(`Tenant left "${entry.name}".`);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Failed to leave the dataspace.'));
    } finally {
      this.busy.set(false);
    }
  }

  private filterEntries(entries: DataspaceEntry[], value: string): DataspaceEntry[] {
    const query = value.trim().toLowerCase();
    return entries.filter(
      (entry) => entry.name.toLowerCase().includes(query) || String(entry.id).includes(query),
    );
  }

  private splitList(value: string): string[] {
    return [
      ...new Set(
        value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
      ),
    ];
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (
        body &&
        typeof body === 'object' &&
        'message' in body &&
        typeof body.message === 'string'
      ) {
        return body.message;
      }
    }
    return error instanceof Error ? error.message : fallback;
  }
}
