import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth.service';
import { authBearerInterceptor } from './auth-bearer.interceptor';
import { HttpClient } from '@angular/common/http';

describe('authBearerInterceptor', () => {
  let http: HttpClient;
  let requests: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authBearerInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { session: () => ({ token: 'browser-token' }) } },
      ],
    });
    http = TestBed.inject(HttpClient);
    requests = TestBed.inject(HttpTestingController);
  });
  afterEach(() => requests.verify());

  it('adds the bearer token only to same-origin non-public requests', () => {
    for (const [url, expected] of [
      ['/api/private', 'Bearer browser-token'],
      ['/config/app-config.json', null],
      ['config/app-config.json', null],
      ['/api/private?return=/config/app-config.json', null],
      ['https://redline.example/api/ui/tenants', null],
      ['//redline.example/api/ui/tenants', null],
    ] as const) {
      http.get(url).subscribe();
      const request = requests.expectOne(url);
      expect(request.request.headers.get('Authorization')).toBe(expected);
      request.flush({});
    }
  });

  it('preserves explicit authorization headers', () => {
    http
      .get('https://files.example/api/files', { headers: { Authorization: 'Bearer explicit' } })
      .subscribe();
    const request = requests.expectOne('https://files.example/api/files');
    expect(request.request.headers.get('Authorization')).toBe('Bearer explicit');
    request.flush({});
  });
});
