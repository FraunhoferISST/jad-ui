import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { disabled, form, FormField, required, validate } from '@angular/forms/signals';
import { ConstraintEditorComponent } from './constraint-editor.component';
import { PolicyBuilderService } from './policy-builder.service';
import {
  ConstraintDraft,
  PolicyCreateRequest,
  PolicySchema,
  RuleDefinition,
  RuleDraft,
} from './policy-schema';

@Component({
  selector: 'app-policy-builder',
  imports: [FormField, ConstraintEditorComponent],
  templateUrl: './policy-builder.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden' },
})
export class PolicyBuilderComponent {
  private readonly service = inject(PolicyBuilderService);
  readonly schema = signal<PolicySchema | undefined>(undefined);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly createdName = signal('');
  readonly createdRequest = signal('');
  readonly definitions = computed(() => this.schema()?.definitions('usage') ?? []);
  readonly nameModel = signal({ name: '' });
  readonly fields = form(this.nameModel, (path) => {
    required(path.name, { message: 'Enter a policy name.' });
    validate(path.name, ({ value }) =>
      value().trim() ? undefined : { kind: 'blank', message: 'Enter a policy name.' },
    );
    disabled(path.name, () => this.saving());
  });
  // Exactly one draft per category. Constraints, not additional rules, are added in the sidebar.
  readonly rules = signal<RuleDraft[]>([]);
  readonly selectedId = signal('');
  readonly selectedRule = computed(() =>
    this.rules().find((rule) => rule.constraints.some((draft) => draft.id === this.selectedId())),
  );
  readonly selectedConstraint = computed(() =>
    this.selectedRule()?.constraints.find((draft) => draft.id === this.selectedId()),
  );
  readonly selectedDefinition = computed(() =>
    this.definitions().find((definition) => definition.kind === this.selectedRule()?.kind),
  );
  readonly selectedBlock = computed(() =>
    this.selectedDefinition()?.blocks.find(
      (block) => block.id === this.selectedConstraint()?.blockId,
    ),
  );
  readonly selectedErrors = computed(() => {
    const constraint = this.selectedConstraint();
    const definition = this.selectedDefinition();
    return constraint && definition ? this.schema()!.constraintErrors(constraint, definition) : [];
  });
  readonly result = computed<{ request?: PolicyCreateRequest; errors: string[] }>(() => {
    const schema = this.schema();
    if (!schema) return { errors: [] };
    try {
      // Keep the base permission. Omit empty optional categories, especially prohibition:
      // an unconditional prohibition would deny use before the user configured anything.
      const rules = this.rules().filter(
        (rule) => rule.kind === 'permission' || rule.constraints.length || rule.duties.length,
      );
      const request = schema.toRequest(this.nameModel().name, rules);
      return { request, errors: schema.validationErrors(request) };
    } catch (error) {
      return { errors: [error instanceof Error ? error.message : 'Invalid policy.'] };
    }
  });
  readonly preview = computed(() =>
    this.result().request
      ? JSON.stringify(this.result().request, null, 2)
      : 'Complete the invalid constraint to preview the request.',
  );
  readonly previewLines = computed(() => this.preview().split('\n'));
  readonly canCreate = computed(
    () =>
      !!this.result().request &&
      !this.fields().invalid() &&
      !this.result().errors.length &&
      !this.loading() &&
      !this.saving() &&
      JSON.stringify(this.result().request) !== this.createdRequest(),
  );

  constructor() {
    void this.loadSchema();
  }

  async loadSchema(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const schema = await this.service.loadSchema();
      this.schema.set(schema);
      this.rules.set(this.definitions().map((definition) => schema.createRule(definition)));
      this.selectedId.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load policy schema.');
    } finally {
      this.loading.set(false);
    }
  }

  constraintsFor(definition: RuleDefinition): ConstraintDraft[] {
    return this.rules().find((rule) => rule.kind === definition.kind)?.constraints ?? [];
  }

  blockFor(definition: RuleDefinition, constraint: ConstraintDraft) {
    return definition.blocks.find((block) => block.id === constraint.blockId);
  }

  addConstraint(definition: RuleDefinition, blockId: string): void {
    if (this.saving()) return;
    const block = this.definitions()
      .find((item) => item.kind === definition.kind)
      ?.blocks.find((item) => item.id === blockId);
    if (!block || !this.schema()) return;
    const constraint = this.schema()!.createConstraint(block);
    this.rules.update((rules) =>
      rules.map((rule) =>
        rule.kind === definition.kind
          ? { ...rule, constraints: [...rule.constraints, constraint] }
          : rule,
      ),
    );
    this.selectedId.set(constraint.id);
  }

  selectConstraint(id: string): void {
    if (!this.saving()) this.selectedId.set(id);
  }

  updateConstraint(id: string, constraint: ConstraintDraft): void {
    if (this.saving() || constraint.id !== id) return;
    this.rules.update((rules) =>
      rules.map((rule) => ({
        ...rule,
        constraints: rule.constraints.map((item) => (item.id === id ? constraint : item)),
      })),
    );
  }

  removeConstraint(id: string): void {
    if (this.saving()) return;
    const rule = this.rules().find((item) => item.constraints.some((draft) => draft.id === id));
    const index = rule?.constraints.findIndex((draft) => draft.id === id) ?? -1;
    this.rules.update((rules) =>
      rules.map((rule) => ({
        ...rule,
        constraints: rule.constraints.filter((item) => item.id !== id),
      })),
    );
    if (this.selectedId() === id) {
      const remaining = this.rules().find((item) => item.id === rule?.id)?.constraints ?? [];
      this.selectedId.set(
        remaining[Math.min(index, remaining.length - 1)]?.id ??
          this.rules().flatMap((item) => item.constraints)[0]?.id ??
          '',
      );
    }
  }

  async createPolicy(): Promise<void> {
    this.fields.name().markAsTouched();
    if (!this.canCreate()) return;
    const request = this.result().request!;
    this.error.set('');
    this.createdName.set('');
    this.saving.set(true);
    try {
      await this.service.createPolicy(request);
      this.createdName.set(request['@id']);
      this.createdRequest.set(JSON.stringify(request));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Policy creation failed.');
    } finally {
      this.saving.set(false);
    }
  }

  async copyRequest(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.preview());
    } catch {
      this.error.set('Could not copy the request. Select and copy the preview instead.');
    }
  }
}
