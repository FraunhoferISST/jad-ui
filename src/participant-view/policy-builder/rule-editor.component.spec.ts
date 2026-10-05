import { ComponentFixture, TestBed } from '@angular/core/testing';
import document from '../../../public/config/jad-profile.json';
import { RuleEditorComponent } from './rule-editor.component';
import { PolicySchema } from './policy-schema';

describe('RuleEditorComponent', () => {
  let fixture: ComponentFixture<RuleEditorComponent>;
  let component: RuleEditorComponent;
  let schema: PolicySchema;

  beforeEach(() => {
    schema = new PolicySchema(document);
    TestBed.configureTestingModule({ imports: [RuleEditorComponent] });
    fixture = TestBed.createComponent(RuleEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('definition', schema.rules[0]);
    fixture.componentRef.setInput('rule', schema.createRule(schema.rules[0]));
  });

  it('adds through a dropdown and popup, then emits the saved constraint', async () => {
    await fixture.whenStable();
    const dropdown: HTMLDivElement = fixture.nativeElement.querySelector('.dropdown');
    const trigger: HTMLButtonElement = dropdown.querySelector(':scope > button')!;
    const menu: HTMLUListElement = dropdown.querySelector('.dropdown-content')!;
    expect(trigger.textContent).toContain('Add Constraint');
    expect(trigger.type).toBe('button');
    expect(trigger.tabIndex).toBe(0);
    expect(fixture.nativeElement.querySelector('app-constraint-menu, details')).toBeNull();
    trigger.focus();
    trigger.click();
    expect(dropdown.matches(':focus-within')).toBeTrue();
    expect(getComputedStyle(menu).display).not.toBe('none');
    const emitted = jasmine.createSpy('ruleChange');
    component.rule.subscribe(emitted);
    const choice = [...menu.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Active membership credential'),
    )!;
    choice.click();
    await fixture.whenStable();
    expect(component.dialog().nativeElement.open).toBeTrue();
    expect(component.rule().constraints.length).toBe(0);
    expect(component.editingDraft()?.value).toBe('active');
    expect(component.canSave()).toBeTrue();
    component.saveEdit();
    await fixture.whenStable();
    expect(component.rule().constraints[0].value).toBe('active');
    expect(component.dialog().nativeElement.open).toBeFalse();
    expect(emitted).toHaveBeenCalled();
    const name: HTMLInputElement = fixture.nativeElement.querySelector('input');
    name.value = 'Custom label';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(component.rule().name).toBe('Custom label');
  });

  it('disables the inline dropdown while the editor is disabled', async () => {
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    const buttons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.dropdown button');
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) {
      expect(button.disabled).toBeTrue();
      button.click();
    }
    expect(component.editingDraft()).toBeUndefined();
    expect(component.rule().constraints).toEqual([]);
  });

  it('shows one-line truncated descriptions in the list and full descriptions in the popup', async () => {
    await fixture.whenStable();
    component.addConstraint('MembershipCredential');
    await fixture.whenStable();
    component.saveEdit();
    await fixture.whenStable();
    const description: HTMLElement = fixture.nativeElement.querySelector('[data-description]');
    const block = schema.rules[0].blocks.find((block) => block.id === 'MembershipCredential')!;
    expect(description.classList.contains('truncate')).toBeTrue();
    expect(description.textContent!.trim()).toBe(block.description);
    expect(fixture.nativeElement.querySelector('app-constraint-editor')).toBeNull();
    component.editConstraint(component.rule().constraints[0]);
    await fixture.whenStable();
    const full: HTMLElement = fixture.nativeElement.querySelector('dialog [data-full-description]');
    expect(full.textContent!.trim()).toBe(block.description);
    expect(full.classList.contains('truncate')).toBeFalse();
  });

  it('does not commit incomplete new constraints', async () => {
    await fixture.whenStable();
    component.addConstraint('CounterPartyId');
    await fixture.whenStable();
    expect(component.canSave()).toBeFalse();
    component.saveEdit();
    expect(component.rule().constraints.length).toBe(0);
    component.cancelEdit();
    expect(component.editingDraft()).toBeUndefined();
  });

  it('discards edits on Cancel and Escape, but saves valid edits without duplicating the row', async () => {
    const draft = schema.createConstraint(
      schema.rules[0].blocks.find((block) => block.id === 'CounterPartyId')!,
    );
    draft.value = 'did:web:before';
    fixture.componentRef.setInput('rule', { ...component.rule(), constraints: [draft] });
    await fixture.whenStable();
    component.editConstraint(draft);
    await fixture.whenStable();
    component.editingDraft.update((value) => ({ ...value!, value: 'did:web:cancelled' }));
    component.cancelEdit();
    expect(component.rule().constraints[0].value).toBe('did:web:before');
    component.editConstraint(draft);
    await fixture.whenStable();
    component.editingDraft.update((value) => ({ ...value!, value: 'did:web:escaped' }));
    component.dialog().nativeElement.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(component.rule().constraints[0].value).toBe('did:web:before');
    component.editConstraint(draft);
    await fixture.whenStable();
    component.editingDraft.update((value) => ({ ...value!, value: 'did:web:after' }));
    component.saveEdit();
    expect(component.rule().constraints.length).toBe(1);
    expect(component.rule().constraints[0].value).toBe('did:web:after');
  });

  it('cancels a new constraint on backdrop click', async () => {
    await fixture.whenStable();
    component.addConstraint('MembershipCredential');
    await fixture.whenStable();
    fixture.nativeElement.querySelector('.modal-backdrop button').click();
    expect(component.editingDraft()).toBeUndefined();
    expect(component.rule().constraints).toEqual([]);
  });

  it('restricts the dropdown for an access policy, including logical groups', async () => {
    const definition = schema.definitions('access')[0];
    fixture.componentRef.setInput('definition', definition);
    fixture.componentRef.setInput('rule', schema.createRule(definition));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toContain('Contract validity date');
    component.addConstraint('inForceDate');
    expect(component.editingDraft()).toBeUndefined();
    component.addConstraint('group:and');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('dialog').textContent).not.toContain(
      'Contract validity date',
    );
  });

  it('allows attached duties with their own restricted constraint palette', async () => {
    component.addDuty();
    await fixture.whenStable();
    const duty: HTMLElement = fixture.nativeElement.querySelector('app-rule-editor');
    expect(duty).toBeTruthy();
    expect(duty.textContent).not.toContain('Contract validity date');
    component.removeDuty(component.rule().duties[0].id);
    await fixture.whenStable();
    expect(component.rule().duties.length).toBe(0);
  });
});
