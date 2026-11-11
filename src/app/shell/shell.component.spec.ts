import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DashboardStateService, EdcConfig } from '@eclipse-edc/dashboard-core';
import { Subject } from 'rxjs';
import { EDC_CUSTOM_CONTROLLERS } from '../../participant-view/models/edc.model';
import { AuthService } from '../auth/auth.service';
import { REDLINE_CONFIG } from '../redline/redline.config';
import { RedlineService } from '../redline/redline.service';
import { ShellComponent } from './shell.component';

describe('ShellComponent connector configuration', () => {
  it('creates a participant connector without mutating authentication state', async () => {
    const config: EdcConfig = {
      connectorName: 'Participant',
      managementUrl: 'http://management.test',
      managementApiVersion: 'v5',
      defaultUrl: 'http://default.test',
      protocolUrl: 'http://protocol.test',
      authorization: { key: 'Authorization', value: 'original' },
    };
    const original = structuredClone(config);
    const session = signal({ token: 'access-token' });
    const currentEdcConfig$ = new Subject<EdcConfig>();
    const setCurrentEdcConfig = jasmine.createSpy('setCurrentEdcConfig');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            user: () => ({ participantEdcConfig: config }),
            role: () => 'tenant-user',
            session,
          },
        },
        { provide: DashboardStateService, useValue: { currentEdcConfig$, setCurrentEdcConfig } },
        { provide: REDLINE_CONFIG, useValue: { baseUrl: 'http://redline.test' } },
        { provide: RedlineService, useValue: {} },
      ],
    });
    const shell = TestBed.runInInjectionContext(() => new ShellComponent());
    shell.ngOnInit();
    TestBed.inject(HttpTestingController)
      .expectOne('config/app-config.json')
      .flush({ menuItems: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(setCurrentEdcConfig).toHaveBeenCalled();
    const passed: EdcConfig = setCurrentEdcConfig.calls.mostRecent().args[0];
    expect(passed).not.toBe(config);
    expect(passed.customControllers).toBe(EDC_CUSTOM_CONTROLLERS);
    expect(passed.authorization?.value).toBe('Bearer access-token');
    expect(config).toEqual(original);
  });
});
