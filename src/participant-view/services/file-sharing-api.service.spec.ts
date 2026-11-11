import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { AuthService } from '../../app/auth/auth.service';
import { FileSharingApiService } from './file-sharing-api.service';
import { ParticipantConfigService } from './participant-config.service';

describe('FileSharingApiService authorization', () => {
  let service: FileSharingApiService;
  let http: HttpTestingController;
  let context: string | undefined;
  let token: string | undefined;
  beforeEach(() => {
    context = 'participant / 1';
    token = 'browser-token';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { user: () => ({ participantContextId: context }), session: () => ({ token }) },
        },
        {
          provide: ParticipantConfigService,
          useValue: { getFileSharingConfig: async () => ({ baseUrl: 'https://files.test/' }) },
        },
      ],
    });
    service = TestBed.inject(FileSharingApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sends an explicit bearer token to the configured endpoint and returns an array', fakeAsync(() => {
    let result: unknown;
    service.listFiles().then((files) => {
      result = files;
    });
    flushMicrotasks();
    const request = http.expectOne('https://files.test/api/files/participant%20%2F%201');
    expect(request.request.headers.get('Authorization')).toBe('Bearer browser-token');
    request.flush([{ id: 'file' }]);
    flushMicrotasks();
    expect(result).toEqual([{ id: 'file' }]);
  }));

  it('rejects missing participant or token before issuing any request', async () => {
    context = undefined;
    await expectAsync(service.listFiles()).toBeRejectedWithError(/Participant context id/);
    context = 'participant';
    token = undefined;
    await expectAsync(service.listFiles()).toBeRejectedWithError(/Authentication token/);
    http.expectNone(() => true);
  });
});
