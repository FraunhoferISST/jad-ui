import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { REDLINE_CONFIG } from '../../operator-view/redline.config';
import { ParticipantContextService } from './participant-context.service';
import { RedlineApiService } from './redline-api.service';

describe('RedlineApiService seeded provider', () => {
  let service: RedlineApiService;
  let http: HttpTestingController;
  let resolve: jasmine.Spy;
  const tenantsUrl = 'http://redline.test/api/ui/service-providers/1/tenants';
  const participantUrl = `${tenantsUrl}/7/participants/9`;

  beforeEach(() => {
    // A stale provider ID from an older cached context cannot override provider 1.
    resolve = jasmine.createSpy('resolve').and.resolveTo({
      providerId: 99,
      tenantId: 7,
      participantId: 9,
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: REDLINE_CONFIG, useValue: { baseUrl: 'http://redline.test/' } },
        { provide: ParticipantContextService, useValue: { resolve } },
      ],
    });
    service = TestBed.inject(RedlineApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads participant dataspaces from provider 1', async () => {
    const result = service.getParticipantDataspaces();
    await Promise.resolve();
    http.expectOne(`${participantUrl}/dataspaces`).flush([{ id: 2, name: 'Demo' }]);
    expect(await result).toEqual([{ id: 2, name: 'Demo' }]);
  });

  it('loads partners from provider 1 and normalizes single-resource responses', async () => {
    const result = service.getPartners(2);
    await Promise.resolve();
    const partner = { identifier: 'did:web:partner' };
    http.expectOne(`${participantUrl}/partners/2`).flush(partner);
    expect(await result).toEqual([partner]);
  });

  it('creates partners under provider 1', async () => {
    const partner = { identifier: 'did:web:partner', nickname: 'Partner' };
    const result = service.createPartner(2, partner);
    await Promise.resolve();
    const request = http.expectOne(`${participantUrl}/partners/2`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(partner);
    request.flush(partner);
    expect(await result).toEqual(partner);
  });

  it('lists tenants directly from provider 1 without participant-context lookup', async () => {
    const result = service.getTenants();
    const tenant = { id: 7, providerId: 1, name: 'Demo' };
    http.expectOne(tenantsUrl).flush(tenant);
    expect(await result).toEqual([tenant]);
    expect(resolve).not.toHaveBeenCalled();
  });
});
