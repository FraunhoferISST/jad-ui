import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { EdcClientService } from '@eclipse-edc/dashboard-core';
import document from '../../../ops/jad-profile-seed/jad-profile.json';
import { POLICY_SCHEMA_URL, PolicyBuilderService } from './policy-builder.service';
import { PolicySchema } from './policy-schema';

describe('PolicyBuilderService', () => {
  let service: PolicyBuilderService;
  let http: HttpTestingController;
  let create: jasmine.Spy;
  let getClient: jasmine.Spy;

  beforeEach(() => {
    create = jasmine.createSpy('create').and.resolveTo(undefined);
    getClient = jasmine.createSpy('getClient').and.resolveTo({ policyCreation: { create } });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: EdcClientService, useValue: { getClient } },
      ],
    });
    service = TestBed.inject(PolicyBuilderService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads the actual public schema without requiring platform-admin APIs', async () => {
    const loaded = service.loadSchema();
    const request = http.expectOne(POLICY_SCHEMA_URL);
    expect(request.request.method).toBe('GET');
    request.flush(document);
    const schema = await loaded;
    expect(schema.rules.length).toBe(3);
    expect(schema.profile).toBe(document.$id);
  });

  it('propagates schema loading failures', async () => {
    const loaded = service.loadSchema();
    http.expectOne(POLICY_SCHEMA_URL).flush('Not found', { status: 404, statusText: 'Not Found' });
    await expectAsync(loaded).toBeRejected();
  });

  it('uses the selected participant client and passes the compact request unchanged', async () => {
    const schema = new PolicySchema(document);
    const request = schema.toRequest('Named policy', []);
    await service.createPolicy(request);
    expect(getClient).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledOnceWith(request);
    expect(Object.keys(request)).not.toContain('id');
  });
});
