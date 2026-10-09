import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../app/auth/auth.service';
import { RedlineService } from '../../operator-view/services/redline.service';
import { ParticipantContextService } from './participant-context.service';

describe('ParticipantContextService', () => {
  let service: ParticipantContextService;
  let redline: jasmine.SpyObj<RedlineService>;
  let user: jasmine.Spy;
  const participant = { id: 9, identifier: 'did:web:demo' };
  const tenant = { id: 7, providerId: 1, name: 'Demo', participants: [participant] };
  const context = {
    tenantId: 7,
    participantId: 9,
    participantIdentifier: participant.identifier,
    tenantName: 'Demo',
  };

  beforeEach(() => {
    redline = jasmine.createSpyObj<RedlineService>('RedlineService', ['listTenants', 'getTenant']);
    redline.listTenants.and.resolveTo([tenant]);
    user = jasmine.createSpy('user').and.returnValue({
      role: 'tenant-user',
      participantEdcConfig: { did: participant.identifier },
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: RedlineService, useValue: redline },
      ],
    });
    service = TestBed.inject(ParticipantContextService);
  });

  it('resolves through the seeded-provider tenant API without provider discovery or configuration', async () => {
    expect(await service.resolve()).toEqual(context);
    expect(redline.listTenants).toHaveBeenCalledOnceWith();
    expect(redline.getTenant).not.toHaveBeenCalled();
  });

  it('loads tenant details when participants are absent from the tenant list', async () => {
    redline.listTenants.and.resolveTo([{ ...tenant, participants: [] }]);
    redline.getTenant.and.resolveTo(tenant);
    expect(await service.resolve()).toEqual(context);
    expect(redline.getTenant).toHaveBeenCalledOnceWith(7);
  });

  it('shares in-flight lookups and caches the resolved context until reset', async () => {
    expect(await Promise.all([service.resolve(), service.resolve()])).toEqual([context, context]);
    expect(await service.resolve()).toEqual(context);
    expect(redline.listTenants).toHaveBeenCalledTimes(1);
    service.reset();
    expect(await service.resolve()).toEqual(context);
    expect(redline.listTenants).toHaveBeenCalledTimes(2);
  });

  it('rejects unmatched DIDs rather than searching another provider', async () => {
    redline.listTenants.and.resolveTo([]);
    await expectAsync(service.resolve()).toBeRejectedWithError(/seeded service provider/);
    expect(redline.listTenants).toHaveBeenCalledOnceWith();
  });

  it('propagates seeded-provider failures and allows retry', async () => {
    redline.listTenants.and.rejectWith(new Error('Provider 1 unavailable'));
    await expectAsync(service.resolve()).toBeRejectedWithError('Provider 1 unavailable');
    redline.listTenants.and.resolveTo([tenant]);
    expect(await service.resolve()).toEqual(context);
  });

  it('rejects operator sessions before making Redline requests', async () => {
    user.and.returnValue({ role: 'operator' });
    await expectAsync(service.resolve()).toBeRejectedWithError(/unavailable/);
    expect(redline.listTenants).not.toHaveBeenCalled();
  });
});
