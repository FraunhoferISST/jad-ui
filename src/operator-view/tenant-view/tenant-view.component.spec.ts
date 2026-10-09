import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { TenantRegistration } from '../models/redline.models';
import { REDLINE_CONFIG } from '../redline.config';
import { RedlineService } from '../services/redline.service';
import { TenantFormComponent } from './tenant-form/tenant-form.component';
import { TenantViewComponent } from './tenant-view.component';

describe('TenantViewComponent seeded provider', () => {
  let component: TenantViewComponent;
  let redline: jasmine.SpyObj<RedlineService>;
  let modal: jasmine.SpyObj<ModalAndAlertService>;
  const participant = { id: 9, identifier: 'did:web:demo' };
  const tenant = { id: 7, providerId: 1, name: 'Demo', participants: [participant] };

  beforeEach(() => {
    redline = jasmine.createSpyObj<RedlineService>('RedlineService', [
      'listTenants',
      'getDataspaces',
      'registerTenant',
      'deployParticipant',
      'getParticipant',
      'registerDataPlane',
    ]);
    redline.listTenants.and.resolveTo([tenant]);
    redline.getDataspaces.and.resolveTo([{ id: 2, name: 'Demo dataspace' }]);
    redline.registerTenant.and.resolveTo(tenant);
    redline.deployParticipant.and.resolveTo(participant);
    redline.getParticipant.and.resolveTo({
      ...participant,
      agents: [{ id: 3, type: 'connector', state: 'ACTIVE' }],
    });
    redline.registerDataPlane.and.resolveTo();
    modal = jasmine.createSpyObj<ModalAndAlertService>('ModalAndAlertService', [
      'openModal',
      'closeModal',
      'showAlert',
    ]);
    TestBed.configureTestingModule({
      imports: [TenantViewComponent],
      providers: [
        { provide: RedlineService, useValue: redline },
        { provide: ModalAndAlertService, useValue: modal },
        { provide: REDLINE_CONFIG, useValue: { didPrefix: 'did:web:identity.test:' } },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { mode: 'open' } } } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new TenantViewComponent());
  });

  afterEach(() => component.ngOnDestroy());

  it('loads tenants immediately and refreshes without a provider selection', async () => {
    await component.ngOnInit();
    expect(redline.listTenants).toHaveBeenCalledOnceWith();
    expect(component.tenants()).toEqual([tenant]);
    expect(component.fetched()).toBeTrue();
    await component.refreshTenants();
    expect(redline.listTenants).toHaveBeenCalledTimes(2);
  });

  it('shows tenant registration but no provider selector or creation button', async () => {
    const fixture = TestBed.createComponent(TenantViewComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).not.toContain('Provider');
    expect(element.textContent).not.toContain('Service provider');
    const register = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Register tenant'),
    )!;
    expect(register.disabled).toBeFalse();
    register.click();
    expect(modal.openModal).toHaveBeenCalled();
  });

  it('registers a tenant without a provider argument and reloads tenants', fakeAsync(() => {
    component.openRegisterTenant();
    const [form, , outputs] = modal.openModal.calls.mostRecent().args;
    expect(form).toBe(TenantFormComponent);
    const registration = { tenantName: 'Demo', dataspaceInfos: [{ dataspaceId: 2 }] };
    (outputs as { save: (value: TenantRegistration) => void }).save(registration);
    flushMicrotasks();
    expect(redline.registerTenant).toHaveBeenCalledOnceWith(registration);
    expect(redline.listTenants).toHaveBeenCalledOnceWith();
  }));

  it('deploys and polls a participant without a provider argument', fakeAsync(() => {
    component.deployParticipant(tenant, participant);
    flushMicrotasks();
    expect(redline.deployParticipant).toHaveBeenCalledOnceWith(7, 9, {
      participantId: 9,
      identifier: 'did:web:identity.test:demo',
    });
    expect(component.pollingParticipantIds().has(9)).toBeTrue();
    tick(500);
    expect(redline.getParticipant).toHaveBeenCalledOnceWith(7, 9);
    expect(component.pollingParticipantIds().has(9)).toBeFalse();
  }));

  it('registers a participant data plane without a provider argument', async () => {
    await component.registerDataPlane(tenant, participant);
    expect(redline.registerDataPlane).toHaveBeenCalledOnceWith(7, 9);
  });
});
