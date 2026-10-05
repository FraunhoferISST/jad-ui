import { ComponentFixture, TestBed } from '@angular/core/testing';
import document from '../../../public/config/jad-profile.json';
import { ConstraintEditorComponent } from './constraint-editor.component';
import { AtomicBlock, PolicySchema } from './policy-schema';

describe('ConstraintEditorComponent', () => {
  let fixture: ComponentFixture<ConstraintEditorComponent>;
  let component: ConstraintEditorComponent;
  let schema: PolicySchema;

  beforeEach(() => {
    schema = new PolicySchema(document);
    TestBed.configureTestingModule({ imports: [ConstraintEditorComponent] });
    fixture = TestBed.createComponent(ConstraintEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('definition', schema.rules[0]);
  });

  it('switches counterparty from a scalar field to a list field when the operator changes', async () => {
    const block = schema.rules[0].blocks.find(
      (block) => block.id === 'CounterPartyId',
    ) as AtomicBlock;
    fixture.componentRef.setInput('draft', schema.createConstraint(block));
    await fixture.whenStable();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    select.value = 'isAnyOf';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(component.draft().operator).toBe('isAnyOf');
    expect(component.choice()?.type).toBe('array');
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(textarea).toBeTruthy();
    textarea.value = 'did:web:one\ndid:web:two';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(component.draft().value).toBe('did:web:one\ndid:web:two');
  });

  it('renders and edits recursively nested groups', async () => {
    const block = schema.rules[0].blocks.find((block) => block.id === 'group:and')!;
    fixture.componentRef.setInput('draft', schema.createConstraint(block));
    component.addChild('group:or');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-constraint-editor')).toBeTruthy();
    const child = component.draft().children[0];
    expect(child.blockId).toBe('group:or');
    component.removeChild(child.id);
    await fixture.whenStable();
    expect(component.draft().children.length).toBe(0);
  });

  it('adds a child through an inline button dropdown and closes it after selection', async () => {
    const block = schema.rules[0].blocks.find((block) => block.id === 'group:and')!;
    fixture.componentRef.setInput('draft', schema.createConstraint(block));
    await fixture.whenStable();
    const dropdown: HTMLDivElement = fixture.nativeElement.querySelector('.dropdown');
    const trigger: HTMLButtonElement = dropdown.querySelector(':scope > button')!;
    const menu: HTMLUListElement = dropdown.querySelector('.dropdown-content')!;
    expect(trigger.type).toBe('button');
    expect(fixture.nativeElement.querySelector('app-constraint-menu, details')).toBeNull();
    trigger.focus();
    trigger.click();
    expect(dropdown.matches(':focus-within')).toBeTrue();
    expect(getComputedStyle(menu).display).not.toBe('none');
    const option = [...menu.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Active membership credential'),
    )!;
    option.focus();
    option.click();
    await fixture.whenStable();
    expect(component.draft().children[0].blockId).toBe('MembershipCredential');
    expect(dropdown.matches(':focus-within')).toBeFalse();
    expect(fixture.nativeElement.querySelector('app-constraint-editor')).toBeTruthy();
  });

  it('disables value controls and recursive group editing while a policy is being saved', async () => {
    const block = schema.rules[0].blocks.find((block) => block.id === 'group:and')!;
    const childBlock = schema.rules[0].blocks.find((block) => block.id === 'CounterPartyId')!;
    const draft = schema.createConstraint(block);
    draft.children.push(schema.createConstraint(childBlock));
    fixture.componentRef.setInput('draft', draft);
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.disabled).toBeTrue();
    const add: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button[title="Add child constraint"]',
    );
    expect(add.disabled).toBeTrue();
    component.addChild('MembershipCredential');
    component.removeChild(draft.children[0].id);
    expect(component.draft().children).toEqual(draft.children);
  });

  it('exposes constant values as the only selectable option', async () => {
    const block = schema.rules[0].blocks.find((block) => block.id === 'MembershipCredential')!;
    fixture.componentRef.setInput('draft', schema.createConstraint(block));
    await fixture.whenStable();
    expect(component.fields.value().readonly()).toBeTrue();
    expect(component.draft().value).toBe('active');
    const selects: NodeListOf<HTMLSelectElement> = fixture.nativeElement.querySelectorAll('select');
    expect(selects[1].options.length).toBe(1);
    expect(selects[1].value).toBe('active');
  });
});
