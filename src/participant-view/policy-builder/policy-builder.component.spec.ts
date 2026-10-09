import { ComponentFixture, TestBed } from '@angular/core/testing';
import document from '../../../ops/jad-profile-seed/jad-profile.json';
import { PolicyBuilderComponent } from './policy-builder.component';
import { PolicyBuilderService } from './policy-builder.service';
import { PolicySchema } from './policy-schema';

describe('PolicyBuilderComponent', () => {
  let fixture: ComponentFixture<PolicyBuilderComponent>;
  let component: PolicyBuilderComponent;
  let service: jasmine.SpyObj<PolicyBuilderService>;

  beforeEach(() => {
    service = jasmine.createSpyObj('PolicyBuilderService', ['loadSchema', 'createPolicy']);
    service.loadSchema.and.resolveTo(new PolicySchema(document));
    service.createPolicy.and.resolveTo(undefined);
    TestBed.configureTestingModule({
      imports: [PolicyBuilderComponent],
      providers: [{ provide: PolicyBuilderService, useValue: service }],
    });
    fixture = TestBed.createComponent(PolicyBuilderComponent);
    component = fixture.componentInstance;
  });

  it('loads three fixed categories without a policy-type selector or rule editor', async () => {
    await fixture.whenStable();
    expect(service.loadSchema).toHaveBeenCalledTimes(1);
    expect(component.rules().map((rule) => rule.kind)).toEqual([
      'permission',
      'obligation',
      'prohibition',
    ]);
    expect(fixture.nativeElement.querySelector('[aria-label="Select Policy Type"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-rule-editor')).toBeNull();
    expect(component.selectedConstraint()).toBeUndefined();
    expect(component.result().request!.policy['permission']).toEqual([{ action: 'use' }]);
    expect(component.result().request!.policy['obligation']).toBeUndefined();
    expect(component.result().request!.policy['prohibition']).toBeUndefined();
    expect(component.result().request!.privateProperties).toBeUndefined();
    expect(component.canCreate()).toBeFalse();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(button.disabled).toBeTrue();
  });

  it('uses the category + dropdown to add constraints to one rule and select the center editor', async () => {
    await fixture.whenStable();
    const category: HTMLElement = fixture.nativeElement.querySelector(
      'section[aria-label="Permission constraints"]',
    );
    const trigger: HTMLButtonElement = category.querySelector('button[title="Add constraint"]')!;
    trigger.focus();
    trigger.click();
    expect(category.querySelector('.dropdown')!.matches(':focus-within')).toBeTrue();
    const option = [
      ...category.querySelectorAll<HTMLButtonElement>('.dropdown-content button'),
    ].find((button) => button.textContent?.includes('Active membership credential'))!;
    option.click();
    await fixture.whenStable();
    expect(component.selectedConstraint()?.blockId).toBe('MembershipCredential');
    expect(
      fixture.nativeElement.querySelector('[aria-label="Constraint editor"] app-constraint-editor'),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    const firstId = component.selectedId();
    component.addConstraint(component.definitions()[0], 'ManufacturerCredential');
    expect(component.rules().length).toBe(3);
    const permission = component.result().request!.policy['permission'] as Record<
      string,
      unknown
    >[];
    expect(permission.length).toBe(1);
    expect((permission[0]['constraint'] as unknown[]).length).toBe(2);
    expect(component.selectedId()).not.toBe(firstId);
    component.selectConstraint(firstId);
    expect(component.selectedConstraint()?.blockId).toBe('MembershipCredential');
  });

  it('keeps obligation and prohibition arrays single-item, and omits them again when cleared', async () => {
    await fixture.whenStable();
    component.nameModel.set({ name: 'Test' });
    for (const definition of component.definitions()) {
      component.addConstraint(definition, 'MembershipCredential');
      component.addConstraint(definition, 'ManufacturerCredential');
      const rules = component.result().request!.policy[definition.kind] as Record<
        string,
        unknown
      >[];
      expect(rules.length).toBe(1);
      expect((rules[0]['constraint'] as unknown[]).length).toBe(2);
    }
    expect(component.canCreate()).toBeTrue();
    for (const rule of component.rules().filter((rule) => rule.kind !== 'permission')) {
      for (const constraint of rule.constraints) component.removeConstraint(constraint.id);
    }
    expect(component.result().request!.policy['obligation']).toBeUndefined();
    expect(component.result().request!.policy['prohibition']).toBeUndefined();
    expect(component.rules().length).toBe(3);
  });

  it('edits the selected constraint directly and blocks creation until the whole policy is valid', async () => {
    await fixture.whenStable();
    component.nameModel.set({ name: 'Partner policy' });
    component.addConstraint(component.definitions()[0], 'CounterPartyId');
    await fixture.whenStable();
    expect(component.canCreate()).toBeFalse();
    await component.createPolicy();
    expect(service.createPolicy).not.toHaveBeenCalled();
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[aria-label="Constraint editor"] input',
    );
    input.value = 'did:web:partner';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(component.selectedConstraint()?.value).toBe('did:web:partner');
    expect(component.preview()).toContain('did:web:partner');
    expect(component.canCreate()).toBeTrue();
    component.addConstraint(component.definitions()[1], 'CounterPartyId');
    expect(component.canCreate()).toBeFalse();
    component.selectConstraint(component.rules()[0].constraints[0].id);
    expect(component.selectedErrors()).toEqual([]);
    expect(component.canCreate()).toBeFalse();
  });

  it('creates the exact preview using the configurable name without redundant id or purpose metadata', async () => {
    await fixture.whenStable();
    const name: HTMLInputElement = fixture.nativeElement.querySelector('input');
    name.value = 'Partner policy';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const request = component.result().request!;
    expect(request['@id']).toBe('Partner policy');
    expect(component.canCreate()).toBeTrue();
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(service.createPolicy).toHaveBeenCalledOnceWith(request);
    expect(Object.keys(request)).not.toContain('id');
    expect(request.privateProperties).toBeUndefined();
    expect(component.createdName()).toBe('Partner policy');
    expect(component.canCreate()).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('was created successfully');
  });

  it('updates selection when a constraint is removed without removing a category', async () => {
    await fixture.whenStable();
    component.addConstraint(component.definitions()[0], 'MembershipCredential');
    const first = component.selectedId();
    component.addConstraint(component.definitions()[0], 'ManufacturerCredential');
    component.removeConstraint(component.selectedId());
    expect(component.selectedId()).toBe(first);
    component.removeConstraint(first);
    expect(component.selectedId()).toBe('');
    expect(component.selectedConstraint()).toBeUndefined();
    expect(component.rules().length).toBe(3);
    expect(component.result().request!.policy['permission']).toEqual([{ action: 'use' }]);
  });

  it('does not add an operand unsupported by the selected category', async () => {
    await fixture.whenStable();
    component.addConstraint(component.definitions()[1], 'inForceDate');
    expect(component.selectedConstraint()).toBeUndefined();
    expect(component.rules().every((rule) => rule.constraints.length === 0)).toBeTrue();
  });

  it('prevents edits and duplicate submissions while saving, and reports backend errors', async () => {
    await fixture.whenStable();
    component.nameModel.set({ name: 'Test' });
    component.addConstraint(component.definitions()[0], 'MembershipCredential');
    const draft = component.selectedConstraint()!;
    let reject!: (reason: Error) => void;
    service.createPolicy.and.returnValue(
      new Promise((_, rejectPromise) => {
        reject = rejectPromise;
      }),
    );
    const pending = component.createPolicy();
    expect(component.saving()).toBeTrue();
    component.addConstraint(component.definitions()[1], 'ManufacturerCredential');
    component.updateConstraint(draft.id, { ...draft, value: 'changed' });
    component.removeConstraint(draft.id);
    expect(component.selectedConstraint()).toEqual(draft);
    expect(component.rules()[1].constraints).toEqual([]);
    await component.createPolicy();
    expect(service.createPolicy).toHaveBeenCalledTimes(1);
    reject(new Error('request was malformed: schema validation failed'));
    await pending;
    await fixture.whenStable();
    expect(component.saving()).toBeFalse();
    expect(component.error()).toContain('schema validation failed');
    expect(component.createdName()).toBe('');
    expect(component.canCreate()).toBeTrue();
  });

  it('bounds the workspace height and scrolls navigation, center editor and JSON independently', async () => {
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    host.style.height = '600px';
    host.style.width = '1100px';
    component.nameModel.set({ name: 'Large policy' });
    for (let index = 0; index < 50; index++)
      component.addConstraint(component.definitions()[0], 'MembershipCredential');
    component.addConstraint(component.definitions()[0], 'group:and');
    const group = component.selectedConstraint()!;
    const block = component
      .definitions()[0]
      .blocks.find((block) => block.id === 'MembershipCredential')!;
    component.updateConstraint(group.id, {
      ...group,
      children: Array.from({ length: 12 }, () => component.schema()!.createConstraint(block)),
    });
    await fixture.whenStable();
    expect(host.getBoundingClientRect().height).toBe(600);
    for (const label of [
      'Policy constraints',
      'Constraint editor content',
      'Creation request JSON',
    ]) {
      const pane: HTMLElement = host.querySelector(`[aria-label="${label}"]`)!;
      expect(getComputedStyle(pane).overflowY).toBe('auto');
      expect(pane.scrollHeight).toBeGreaterThan(pane.clientHeight);
      expect(pane.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        host.getBoundingClientRect().bottom + 1,
      );
    }
    expect(host.scrollHeight).toBeLessThanOrEqual(host.clientHeight + 1);
  });

  it('shows a retry option when the schema cannot be loaded', async () => {
    await fixture.whenStable();
    component.schema.set(undefined);
    service.loadSchema.and.rejectWith(new Error('Schema unavailable'));
    await component.loadSchema();
    await fixture.whenStable();
    expect(component.error()).toBe('Schema unavailable');
    expect(fixture.nativeElement.textContent).toContain('Retry loading schema');
    expect(component.canCreate()).toBeFalse();
  });
});
