import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { RedlineService } from '../../operator-view/services/redline.service';
import { RegistrationComponent } from './registration.component';

describe('RegistrationComponent', () => {
  let redline: jasmine.SpyObj<RedlineService>;

  beforeEach(() => {
    redline = jasmine.createSpyObj<RedlineService>('RedlineService', [
      'getDataspaces',
      'registerTenant',
    ]);
    redline.getDataspaces.and.resolveTo([{ id: 2, name: 'Demo dataspace' }]);
    redline.registerTenant.and.resolveTo({ id: 7, providerId: 1, name: 'Demo tenant' });
    TestBed.configureTestingModule({
      imports: [RegistrationComponent],
      providers: [provideRouter([]), { provide: RedlineService, useValue: redline }],
    });
  });

  it('registers using only a tenant name and dataspace, with no provider selection', async () => {
    const fixture = TestBed.createComponent(RegistrationComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('select')).toBeNull();
    expect(redline.getDataspaces).toHaveBeenCalledTimes(1);

    const name = element.querySelector<HTMLInputElement>('input[formControlName="tenantName"]')!;
    name.value = ' Demo tenant ';
    name.dispatchEvent(new Event('input'));
    element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await fixture.whenStable();

    const submit = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBeFalse();
    submit.click();
    await fixture.whenStable();

    expect(redline.registerTenant).toHaveBeenCalledOnceWith({
      tenantName: 'Demo tenant',
      dataspaceInfos: [{ dataspaceId: 2 }],
    });
    expect(element.textContent).toContain('Registration for');
    expect(element.textContent).toContain('Demo tenant');
  });

  it('still requires a dataspace selection', async () => {
    const fixture = TestBed.createComponent(RegistrationComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const name = element.querySelector<HTMLInputElement>('input[formControlName="tenantName"]')!;
    name.value = 'Demo tenant';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
    expect(redline.registerTenant).not.toHaveBeenCalled();
  });
});
