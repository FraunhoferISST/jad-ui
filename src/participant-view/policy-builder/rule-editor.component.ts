import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { disabled, form, FormField } from '@angular/forms/signals';
import { ConstraintEditorComponent } from './constraint-editor.component';
import { ConstraintDraft, PolicySchema, RuleDefinition, RuleDraft } from './policy-schema';

@Component({
  selector: 'app-rule-editor',
  imports: [FormField, ConstraintEditorComponent, forwardRef(() => RuleEditorComponent)],
  templateUrl: './rule-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class RuleEditorComponent {
  private readonly injector = inject(Injector);
  readonly schema = input.required<PolicySchema>();
  readonly definition = input.required<RuleDefinition>();
  readonly disabled = input(false);
  readonly rule = model<RuleDraft>({
    id: '',
    kind: 'permission',
    name: '',
    action: '',
    constraints: [],
    duties: [],
  });
  readonly fields = form(this.rule, (path) => {
    disabled(path.name, () => this.disabled());
    disabled(path.action, () => this.disabled());
  });
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('constraintDialog');
  readonly dialogTitleId = `constraint-dialog-${crypto.randomUUID()}`;
  readonly editingDraft = signal<ConstraintDraft | undefined>(undefined);
  readonly adding = signal(false);
  readonly editingErrors = computed(() => {
    const draft = this.editingDraft();
    return draft ? this.schema().constraintErrors(draft, this.definition()) : [];
  });
  readonly canSave = computed(
    () => !!this.editingDraft() && !this.editingErrors().length && !this.disabled(),
  );

  block(draft: ConstraintDraft) {
    return this.definition().blocks.find((block) => block.id === draft.blockId);
  }

  addConstraint(blockId: string): void {
    const block = this.definition().blocks.find((block) => block.id === blockId);
    if (!block || this.disabled()) return;
    this.adding.set(true);
    this.openEditor(this.schema().createConstraint(block));
  }

  editConstraint(draft: ConstraintDraft): void {
    if (this.disabled()) return;
    this.adding.set(false);
    // Edits are transactional: Cancel/backdrop/Escape must not mutate the policy.
    this.openEditor(structuredClone(draft));
  }

  private openEditor(draft: ConstraintDraft): void {
    this.editingDraft.set(draft);
    afterNextRender(
      () => {
        const dialog = this.dialog().nativeElement;
        if (this.editingDraft() && !dialog.open) dialog.showModal();
      },
      { injector: this.injector },
    );
  }

  saveEdit(): void {
    const draft = this.editingDraft();
    if (!draft || !this.canSave()) return;
    if (this.adding()) {
      this.rule.update((rule) => ({ ...rule, constraints: [...rule.constraints, draft] }));
    } else {
      this.updateConstraint(draft.id, draft);
    }
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingDraft.set(undefined);
    this.dialog().nativeElement.close();
  }

  updateConstraint(id: string, constraint: ConstraintDraft): void {
    this.rule.update((rule) => ({
      ...rule,
      constraints: rule.constraints.map((item) => (item.id === id ? constraint : item)),
    }));
  }

  removeConstraint(id: string): void {
    this.rule.update((rule) => ({
      ...rule,
      constraints: rule.constraints.filter((item) => item.id !== id),
    }));
  }

  addDuty(): void {
    const definition = this.definition().duty;
    if (!definition || this.disabled()) return;
    this.rule.update((rule) => ({
      ...rule,
      duties: [...rule.duties, this.schema().createRule(definition)],
    }));
  }

  updateDuty(id: string, duty: RuleDraft): void {
    this.rule.update((rule) => ({
      ...rule,
      duties: rule.duties.map((item) => (item.id === id ? duty : item)),
    }));
  }

  removeDuty(id: string): void {
    this.rule.update((rule) => ({ ...rule, duties: rule.duties.filter((item) => item.id !== id) }));
  }
}
