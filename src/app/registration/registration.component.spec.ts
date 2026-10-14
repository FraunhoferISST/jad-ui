import { ComponentFixture, TestBed } from '@angular/core/testing';
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
    redline.getDataspaces.and.rejectWith(new Error('Dataspaces unavailable'));
    redline.registerTenant.and.resolveTo({ id: 7, providerId: 1, name: 'Demo tenant' });
    TestBed.configureTestingModule({
      imports: [RegistrationComponent],
      providers: [provideRouter([]), { provide: RedlineService, useValue: redline }],
    });
  });

  async function create(): Promise<ComponentFixture<RegistrationComponent>> {
    const fixture = TestBed.createComponent(RegistrationComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function enterName(fixture: ComponentFixture<RegistrationComponent>, value: string): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('registers with only a name, even when dataspaces are unavailable', async () => {
    const fixture = await create();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('select')).toBeNull();
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
    expect(redline.getDataspaces).not.toHaveBeenCalled();

    enterName(fixture, ' Demo tenant ');
    await fixture.whenStable();
    const submit = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBeFalse();
    submit.click();
    await fixture.whenStable();

    expect(redline.registerTenant).toHaveBeenCalledOnceWith({ tenantName: 'Demo tenant' });
    expect(element.textContent).toContain('Registration for');
    expect(element.textContent).toContain('Demo tenant');
  });

  it('rejects missing and whitespace-only names', async () => {
    const fixture = await create();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
    enterName(fixture, '   ');
    await fixture.whenStable();
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
    expect(redline.registerTenant).not.toHaveBeenCalled();
  });

  it('shows submission failures and allows retry', async () => {
    redline.registerTenant.and.rejectWith(new Error('Registration failed'));
    const fixture = await create();
    enterName(fixture, 'Demo tenant');
    await fixture.whenStable();
    const submit: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    submit.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Registration failed');
    expect(submit.disabled).toBeFalse();

    redline.registerTenant.and.resolveTo({ id: 7, providerId: 1, name: 'Demo tenant' });
    submit.click();
    await fixture.whenStable();
    expect(redline.registerTenant).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('Registration for');
  });
});
