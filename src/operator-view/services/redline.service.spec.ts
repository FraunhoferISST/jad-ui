import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { REDLINE_CONFIG } from '../redline.config';
import { RedlineService } from './redline.service';

describe('RedlineService seeded provider', () => {
  let service: RedlineService;
  let http: HttpTestingController;
  const tenantsUrl = 'http://redline.test/api/ui/service-providers/1/tenants';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: REDLINE_CONFIG, useValue: { baseUrl: 'http://redline.test/' } },
      ],
    });
    service = TestBed.inject(RedlineService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists tenants directly under provider 1 without discovering providers', async () => {
    const result = service.listTenants();
    const request = http.expectOne(tenantsUrl);
    expect(request.request.method).toBe('GET');
    request.flush([]);
    expect(await result).toEqual([]);
  });

  it('retrieves a tenant under provider 1', async () => {
    const result = service.getTenant(7);
    http.expectOne(`${tenantsUrl}/7`).flush({ id: 7, providerId: 1, name: 'Demo' });
    expect((await result).id).toBe(7);
  });

  it('registers a tenant under provider 1', async () => {
    const registration = { tenantName: 'Demo', dataspaceInfos: [{ dataspaceId: 2 }] };
    const result = service.registerTenant(registration);
    const request = http.expectOne(tenantsUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(registration);
    request.flush({ id: 7, providerId: 1, name: 'Demo' });
    await result;
  });

  it('polls a participant under provider 1', async () => {
    const result = service.getParticipant(7, 9);
    http.expectOne(`${tenantsUrl}/7/participants/9`).flush({ id: 9, identifier: 'did:web:demo' });
    expect((await result).id).toBe(9);
  });

  it('deploys a participant under provider 1', async () => {
    const deployment = { participantId: 9, identifier: 'did:web:demo' };
    const result = service.deployParticipant(7, 9, deployment);
    const request = http.expectOne(`${tenantsUrl}/7/participants/9/deployments`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(deployment);
    request.flush({ id: 9, identifier: deployment.identifier });
    await result;
  });

  it('registers a data plane under provider 1', async () => {
    const result = service.registerDataPlane(7, 9);
    const request = http.expectOne(`${tenantsUrl}/7/participants/9/dataplanes`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush(null);
    await result;
  });

  it('does not fall back to other providers if the seeded provider is unavailable', async () => {
    const result = service.listTenants();
    const rejected = expectAsync(result).toBeRejected();
    http.expectOne(tenantsUrl).flush('Not found', { status: 404, statusText: 'Not Found' });
    await rejected;
  });
});
