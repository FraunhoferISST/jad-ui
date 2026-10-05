import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  model,
  output,
} from '@angular/core';
import {
  disabled as disabledField,
  form,
  FormField,
  readonly as readonlyField,
} from '@angular/forms/signals';
import { ConstraintDraft, PolicySchema, RuleDefinition } from './policy-schema';

@Component({
  selector: 'app-constraint-editor',
  imports: [FormField, forwardRef(() => ConstraintEditorComponent)],
  templateUrl: './constraint-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConstraintEditorComponent {
  readonly schema = input.required<PolicySchema>();
  readonly definition = input.required<RuleDefinition>();
  readonly draft = model<ConstraintDraft>({
    id: '',
    blockId: '',
    operator: '',
    valueChoice: '',
    value: '',
    children: [],
  });
  readonly remove = output<void>();
  readonly nested = input(false);
  readonly disabled = input(false);
  readonly block = computed(() =>
    this.definition().blocks.find((block) => block.id === this.draft().blockId),
  );
  readonly choices = computed(() => {
    const block = this.block();
    return block?.kind === 'atomic' ? (block.values[this.draft().operator] ?? []) : [];
  });
  readonly choice = computed(() =>
    this.choices().find((choice) => choice.id === this.draft().valueChoice),
  );
  readonly fields = form(this.draft, (path) => {
    disabledField(path.operator, () => this.disabled());
    disabledField(path.valueChoice, () => this.disabled());
    disabledField(path.value, () => this.disabled());
    readonlyField(path.value, () => this.choice()?.fixed ?? false);
  });

  changeOperator(event: Event): void {
    if (this.disabled()) return;
    const operator = (event.target as HTMLSelectElement).value;
    const block = this.block();
    const choice = block?.kind === 'atomic' ? block.values[operator]?.[0] : undefined;
    this.draft.update((draft) => ({
      ...draft,
      operator,
      valueChoice: choice?.id ?? '',
      value: choice?.initial ?? '',
    }));
  }

  changeValueChoice(event: Event): void {
    if (this.disabled()) return;
    const id = (event.target as HTMLSelectElement).value;
    const choice = this.choices().find((choice) => choice.id === id);
    this.draft.update((draft) => ({ ...draft, valueChoice: id, value: choice?.initial ?? '' }));
  }

  addChild(blockId: string): void {
    if (this.disabled()) return;
    const block = this.definition().blocks.find((block) => block.id === blockId);
    if (!block) return;
    this.draft.update((draft) => ({
      ...draft,
      children: [...draft.children, this.schema().createConstraint(block)],
    }));
  }

  updateChild(id: string, child: ConstraintDraft): void {
    if (this.disabled()) return;
    this.draft.update((draft) => ({
      ...draft,
      children: draft.children.map((item) => (item.id === id ? child : item)),
    }));
  }

  removeChild(id: string): void {
    if (this.disabled()) return;
    this.draft.update((draft) => ({
      ...draft,
      children: draft.children.filter((item) => item.id !== id),
    }));
  }
}
