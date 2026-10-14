import { TestBed } from '@angular/core/testing';

import { REDLINE_CONFIG } from '../../redline.config';
import { TenantFormComponent } from './tenant-form.component';

describe('TenantFormComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TenantFormComponent],
      providers: [{ provide: REDLINE_CONFIG, useValue: { didPrefix: 'did:web:identity.test:' } }],
    });
  });

  it('registers without dataspace selection and retains tenant properties and generated DID', async () => {
    const fixture = TestBed.createComponent(TenantFormComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    const save = spyOn(component.save, 'emit');
    component.form.controls.tenantName.setValue(' Demo tenant ');
    component.properties = { region: 'EU' };
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input[type="checkbox"]')).toBeNull();
    expect(component.generatedDid).toBe('did:web:identity.test:demo-tenant');
    component.submit();
    expect(save).toHaveBeenCalledOnceWith({
      tenantName: 'Demo tenant',
      properties: { region: 'EU' },
    });
  });

  it('requires a nonblank tenant name but no dataspace', () => {
    const fixture = TestBed.createComponent(TenantFormComponent);
    const component = fixture.componentInstance;
    const save = spyOn(component.save, 'emit');
    component.form.controls.tenantName.setValue('   ');
    component.submit();
    expect(save).not.toHaveBeenCalled();
    component.form.controls.tenantName.setValue('Demo');
    component.submit();
    expect(save).toHaveBeenCalledOnceWith({ tenantName: 'Demo' });
  });
});
