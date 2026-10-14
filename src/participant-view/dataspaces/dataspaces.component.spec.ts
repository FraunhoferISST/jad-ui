import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataspaceInfo, Tenant } from '../../operator-view/models/redline.models';
import { RedlineService } from '../../operator-view/services/redline.service';
import { ParticipantContextService } from '../services/participant-context.service';
import { DataspacesComponent } from './dataspaces.component';

describe('DataspacesComponent', () => {
  let redline: jasmine.SpyObj<RedlineService>;
  let context: jasmine.SpyObj<ParticipantContextService>;
  const membership: DataspaceInfo = {
    dataspaceId: 2,
    roles: ['consumer'],
    agreementTypes: ['data-sharing'],
    properties: { region: 'EU', nested: { enabled: true } },
  };

  function tenantWith(infos: DataspaceInfo[]): Tenant {
    return {
      id: 7,
      providerId: 1,
      name: 'Demo tenant',
      participants: [{ id: 9, identifier: 'did:web:demo', dataspaceInfos: infos }],
    };
  }

  beforeEach(() => {
    redline = jasmine.createSpyObj<RedlineService>('RedlineService', [
      'getDataspaces',
      'getTenant',
      'onboardTenantToDataspace',
      'offboardTenantFromDataspace',
    ]);
    redline.getDataspaces.and.resolveTo([
      { id: 2, name: 'Joined space' },
      { id: 3, name: 'Available space' },
    ]);
    redline.getTenant.and.resolveTo(tenantWith([membership]));
    redline.onboardTenantToDataspace.and.callFake(async (_id, info) =>
      tenantWith(
        [membership].filter((existing) => existing.dataspaceId !== info.dataspaceId).concat(info),
      ),
    );
    redline.offboardTenantFromDataspace.and.resolveTo(tenantWith([]));
    context = jasmine.createSpyObj<ParticipantContextService>('ParticipantContextService', [
      'resolve',
    ]);
    context.resolve.and.resolveTo({
      tenantId: 7,
      participantId: 9,
      participantIdentifier: 'did:web:demo',
      tenantName: 'Demo tenant',
    });
    TestBed.configureTestingModule({
      imports: [DataspacesComponent],
      providers: [
        { provide: RedlineService, useValue: redline },
        { provide: ParticipantContextService, useValue: context },
      ],
    });
  });

  async function create(): Promise<ComponentFixture<DataspacesComponent>> {
    const fixture = TestBed.createComponent(DataspacesComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function click(fixture: ComponentFixture<DataspacesComponent>, text: string, scope = ''): void {
    const root: HTMLElement = scope
      ? fixture.nativeElement.querySelector(scope)
      : fixture.nativeElement;
    const button = [...root.querySelectorAll('button')].find((b) => {
      const label = b.cloneNode(true) as HTMLElement;
      label.querySelectorAll('[aria-hidden="true"]').forEach((icon) => icon.remove());
      return label.textContent?.trim() === text;
    });
    expect(button).withContext(`button "${text}"`).toBeDefined();
    button!.click();
  }

  function selectDataspace(fixture: ComponentFixture<DataspacesComponent>, id = 3): void {
    const option: HTMLButtonElement = fixture.nativeElement.querySelector(
      `#available-dataspace-${id}`,
    );
    expect(option).withContext(`available dataspace ${id}`).not.toBeNull();
    option.click();
  }

  function changeInput(
    fixture: ComponentFixture<DataspacesComponent>,
    selector: string,
    value: string,
  ): void {
    const field: HTMLInputElement | HTMLTextAreaElement =
      fixture.nativeElement.querySelector(selector);
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  function input(
    fixture: ComponentFixture<DataspacesComponent>,
    name: string,
    value: string,
  ): void {
    changeInput(fixture, `[formControlName="${name}"]`, value);
  }

  it('loads only the authenticated tenant and separates unjoined and joined dataspaces', async () => {
    const fixture = await create();
    const root: HTMLElement = fixture.nativeElement;
    expect(context.resolve).toHaveBeenCalledOnceWith();
    expect(redline.getTenant).toHaveBeenCalledOnceWith(7);
    expect(root.textContent).toContain('Demo tenant');
    expect(root.querySelector('#available-dataspaces #available-dataspace-3')).not.toBeNull();
    expect(root.querySelector('#available-dataspaces #available-dataspace-2')).toBeNull();
    expect(root.querySelector('#joined-dataspaces #dataspace-2')).not.toBeNull();
    expect(root.querySelector('#joined-dataspaces #dataspace-3')).toBeNull();
    expect(root.querySelector('select')).toBeNull();
  });

  it('copies the Partners layout with a search/list above and searched cards below', async () => {
    const fixture = await create();
    const root: HTMLElement = fixture.nativeElement;
    const panels = [...root.querySelectorAll('section > .card')];
    expect(panels.map((panel) => panel.id)).toEqual(['available-dataspaces', 'joined-dataspaces']);
    for (const panel of panels) {
      expect(panel.classList.contains('bg-base-200')).toBeTrue();
      expect(panel.classList.contains('border-base-300')).toBeTrue();
      expect(panel.classList.contains('shadow-xl')).toBeTrue();
    }
    expect(panels[0]!.querySelector('.input.w-full')).not.toBeNull();
    expect(panels[0]!.querySelector('.max-h-72.overflow-y-auto')).not.toBeNull();
    expect(panels[0]!.querySelector('.btn-ghost .checkbox-sm')).not.toBeNull();
    expect(panels[0]!.querySelector('article')).toBeNull();
    expect(panels[1]!.querySelector('.input.max-w-xs')).not.toBeNull();
    expect(panels[1]!.querySelector('.grid')?.classList.contains('xl:grid-cols-3')).toBeTrue();
    expect(root.querySelector('#dataspace-2')?.classList.contains('bg-base-100')).toBeTrue();
    expect(root.textContent).toContain('1 joined dataspace(s) shown');

    click(fixture, 'Manage membership', '#dataspace-2');
    await fixture.whenStable();
    const editor = panels[1]!.querySelector('form');
    expect(editor?.closest('.card')?.classList.contains('bg-base-100')).toBeTrue();
    expect(panels[0]!.querySelector('form')).toBeNull();
  });

  it('filters the unjoined list independently by name or ID, ignoring case and whitespace', async () => {
    const fixture = await create();
    const root: HTMLElement = fixture.nativeElement;
    for (const query of [' AVAILABLE ', ' 3 ']) {
      changeInput(fixture, '[aria-label="Search available dataspaces"]', query);
      await fixture.whenStable();
      expect(root.querySelector('#available-dataspace-3')).not.toBeNull();
      expect(root.querySelector('#dataspace-2')).not.toBeNull();
    }
    changeInput(fixture, '[aria-label="Search available dataspaces"]', 'Joined space');
    await fixture.whenStable();
    expect(root.querySelector('#available-dataspace-3')).toBeNull();
    expect(root.querySelector('#available-dataspace-2')).toBeNull();
    expect(root.querySelector('#available-dataspaces')?.textContent).toContain(
      'No available dataspaces to join',
    );
    expect(root.querySelector('#dataspace-2')).not.toBeNull();
  });

  it('filters joined cards independently by name or ID and updates their count', async () => {
    const fixture = await create();
    const root: HTMLElement = fixture.nativeElement;
    for (const query of [' JOINED ', ' 2 ']) {
      changeInput(fixture, '[aria-label="Filter joined dataspaces"]', query);
      await fixture.whenStable();
      expect(root.querySelector('#dataspace-2')).not.toBeNull();
    }
    changeInput(fixture, '[aria-label="Filter joined dataspaces"]', 'Available space');
    await fixture.whenStable();
    expect(root.querySelector('#joined-dataspaces article')).toBeNull();
    expect(root.querySelector('#joined-dataspaces')?.textContent).toContain(
      'No joined dataspaces found',
    );
    expect(root.textContent).toContain('0 joined dataspace(s) shown');
    expect(root.querySelector('#available-dataspace-3')).not.toBeNull();
  });

  it('toggles and clears the selected dataspace without assigning membership', async () => {
    const fixture = await create();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('form')).toBeNull();
    selectDataspace(fixture);
    await fixture.whenStable();
    expect(root.querySelector('#available-dataspace-3')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('#available-dataspaces .badge')?.textContent).toContain(
      'Available space',
    );
    selectDataspace(fixture);
    await fixture.whenStable();
    expect(root.querySelector('form')).toBeNull();
    expect(root.querySelector('#available-dataspace-3')?.getAttribute('aria-pressed')).toBe(
      'false',
    );
    selectDataspace(fixture);
    await fixture.whenStable();
    click(fixture, 'Clear');
    await fixture.whenStable();
    expect(root.querySelector('form')).toBeNull();
    expect(redline.onboardTenantToDataspace).not.toHaveBeenCalled();
  });

  it('shows loading indicators in both panels and disables refresh while loading', async () => {
    let resolveTenant!: (tenant: Tenant) => void;
    redline.getTenant.and.returnValue(
      new Promise((resolve) => {
        resolveTenant = resolve;
      }),
    );
    const fixture = TestBed.createComponent(DataspacesComponent);
    fixture.autoDetectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const refresh = root.querySelector('button');
    expect(refresh?.disabled).toBeTrue();
    expect(refresh?.textContent).toContain('Refreshing');
    expect(root.querySelectorAll('.loading-bars').length).toBe(2);
    expect(root.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('article')).toBeNull();

    resolveTenant(tenantWith([membership]));
    await fixture.whenStable();
    expect(refresh?.disabled).toBeFalse();
    expect(root.querySelector('.loading-bars')).toBeNull();
    expect(root.querySelector('section')?.getAttribute('aria-busy')).toBe('false');
  });

  it('joins using the tenant endpoint and moves the dataspace to the joined panel', async () => {
    const fixture = await create();
    selectDataspace(fixture);
    await fixture.whenStable();
    input(fixture, 'roles', ' provider, consumer, provider, ');
    input(fixture, 'agreementTypes', ' sharing, ');
    input(fixture, 'properties', '{"region":"US"}');
    await fixture.whenStable();
    click(fixture, 'Join dataspace');
    await fixture.whenStable();

    expect(redline.onboardTenantToDataspace).toHaveBeenCalledOnceWith(7, {
      dataspaceId: 3,
      roles: ['provider', 'consumer'],
      agreementTypes: ['sharing'],
      properties: { region: 'US' },
    });
    expect(fixture.nativeElement.querySelector('#available-dataspace-3')).toBeNull();
    expect(fixture.nativeElement.querySelector('#joined-dataspaces #dataspace-3')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Tenant joined');
    expect(fixture.nativeElement.textContent).toContain('2 joined dataspace(s) shown');
  });

  it('preserves existing metadata when saving unchanged membership', async () => {
    const fixture = await create();
    click(fixture, 'Manage membership', '#dataspace-2');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[formControlName="roles"]').value).toBe('consumer');
    click(fixture, 'Save membership');
    await fixture.whenStable();
    expect(redline.onboardTenantToDataspace).toHaveBeenCalledOnceWith(7, membership);
    expect(fixture.nativeElement.textContent).toContain('Membership for');
  });

  it('sends empty values when metadata is cleared', async () => {
    const fixture = await create();
    click(fixture, 'Manage membership', '#dataspace-2');
    await fixture.whenStable();
    input(fixture, 'roles', '');
    input(fixture, 'agreementTypes', '');
    input(fixture, 'properties', '');
    await fixture.whenStable();
    click(fixture, 'Save membership');
    await fixture.whenStable();
    expect(redline.onboardTenantToDataspace).toHaveBeenCalledOnceWith(7, {
      dataspaceId: 2,
      roles: [],
      agreementTypes: [],
      properties: {},
    });
  });

  for (const invalid of ['{broken', '[]', 'null', '"string"', '42']) {
    it(`rejects invalid/non-object properties: ${invalid}`, async () => {
      const fixture = await create();
      selectDataspace(fixture);
      await fixture.whenStable();
      input(fixture, 'properties', invalid);
      await fixture.whenStable();
      const submit: HTMLButtonElement =
        fixture.nativeElement.querySelector('button[type="submit"]');
      expect(submit.disabled).toBeTrue();
      expect(fixture.nativeElement.textContent).toContain('Enter a valid JSON object');
      submit.click();
      expect(redline.onboardTenantToDataspace).not.toHaveBeenCalled();
    });
  }

  it('requires leave confirmation, supports cancellation, and moves membership back to the available list', async () => {
    const fixture = await create();
    click(fixture, 'Leave', '#dataspace-2');
    await fixture.whenStable();
    expect(redline.offboardTenantFromDataspace).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      'membership and partner references from all',
    );
    click(fixture, 'Cancel', '#dataspace-2');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toContain('Confirm leave');
    click(fixture, 'Leave', '#dataspace-2');
    await fixture.whenStable();
    click(fixture, 'Confirm leave', '#dataspace-2');
    await fixture.whenStable();
    expect(redline.offboardTenantFromDataspace).toHaveBeenCalledOnceWith(7, 2);
    expect(fixture.nativeElement.querySelector('#joined-dataspaces #dataspace-2')).toBeNull();
    expect(fixture.nativeElement.querySelector('#available-dataspace-2')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Tenant left');
  });

  it('keeps the draft and displays backend errors on save failure, allowing retry', async () => {
    redline.onboardTenantToDataspace.and.rejectWith(
      new HttpErrorResponse({
        status: 400,
        error: { message: 'Ambiguous participant selection' },
      }),
    );
    const fixture = await create();
    selectDataspace(fixture);
    await fixture.whenStable();
    input(fixture, 'roles', 'provider');
    await fixture.whenStable();
    click(fixture, 'Join dataspace');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Ambiguous participant selection');
    expect(fixture.nativeElement.querySelector('[formControlName="roles"]').value).toBe('provider');
    expect(fixture.nativeElement.querySelector('#available-dataspace-3')).not.toBeNull();
    const submit: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submit.disabled).toBeFalse();
    redline.onboardTenantToDataspace.and.resolveTo(tenantWith([membership, { dataspaceId: 3 }]));
    submit.click();
    await fixture.whenStable();
    expect(redline.onboardTenantToDataspace).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).not.toContain('Ambiguous participant selection');
  });

  it('retains membership and confirmation when leaving fails', async () => {
    redline.offboardTenantFromDataspace.and.rejectWith(new Error('Leave failed'));
    const fixture = await create();
    click(fixture, 'Leave', '#dataspace-2');
    await fixture.whenStable();
    click(fixture, 'Confirm leave', '#dataspace-2');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Leave failed');
    expect(fixture.nativeElement.querySelector('#joined-dataspaces #dataspace-2')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Confirm leave');
  });

  it('does not issue duplicate saves while one is pending', async () => {
    let resolveSave!: (tenant: Tenant) => void;
    redline.onboardTenantToDataspace.and.returnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const fixture = await create();
    selectDataspace(fixture);
    await fixture.whenStable();
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(redline.onboardTenantToDataspace).toHaveBeenCalledTimes(1);
    resolveSave(tenantWith([membership, { dataspaceId: 3 }]));
    await fixture.whenStable();
  });

  it('shows load errors without enabling membership changes and can refresh', async () => {
    context.resolve.and.rejectWith(new Error('Context unavailable'));
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Context unavailable');
    expect(fixture.nativeElement.querySelector('article')).toBeNull();
    expect(fixture.nativeElement.querySelector('#available-dataspace-3')).toBeNull();
    expect(redline.getTenant).not.toHaveBeenCalled();
    context.resolve.and.resolveTo({
      tenantId: 7,
      participantId: 9,
      participantIdentifier: 'did:web:demo',
      tenantName: 'Demo tenant',
    });
    click(fixture, 'Refresh');
    await fixture.whenStable();
    expect(redline.getTenant).toHaveBeenCalledOnceWith(7);
    expect(fixture.nativeElement.querySelectorAll('article').length).toBe(1);
    expect(fixture.nativeElement.querySelector('#available-dataspace-3')).not.toBeNull();
  });

  it('shows separate empty states when no dataspaces exist', async () => {
    redline.getDataspaces.and.resolveTo([]);
    redline.getTenant.and.resolveTo(tenantWith([]));
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('#available-dataspaces').textContent).toContain(
      'No dataspaces are available yet',
    );
    expect(fixture.nativeElement.querySelector('#joined-dataspaces').textContent).toContain(
      'No joined dataspaces found',
    );
    expect(fixture.nativeElement.querySelector('.rounded-box.text-center')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('0 joined dataspace(s) shown');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('shows no available dataspaces when the tenant has joined every listed dataspace', async () => {
    redline.getTenant.and.resolveTo(tenantWith([membership, { dataspaceId: 3 }]));
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('#available-dataspaces').textContent).toContain(
      'No available dataspaces to join',
    );
    expect(fixture.nativeElement.querySelectorAll('#joined-dataspaces article').length).toBe(2);
  });

  it('includes memberships from other tenant participants and missing catalog entries only in the joined section', async () => {
    const tenant = tenantWith([]);
    tenant.participants!.push({
      id: 10,
      identifier: 'did:web:other',
      dataspaceInfos: [{ dataspaceId: 99 }],
    });
    redline.getTenant.and.resolveTo(tenant);
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('#joined-dataspaces #dataspace-99')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#available-dataspace-99')).toBeNull();
    click(fixture, 'Leave', '#dataspace-99');
    await fixture.whenStable();
    click(fixture, 'Confirm leave', '#dataspace-99');
    await fixture.whenStable();
    expect(redline.offboardTenantFromDataspace).toHaveBeenCalledOnceWith(7, 99);
  });
});
