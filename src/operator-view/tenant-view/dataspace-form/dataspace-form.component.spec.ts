import { TestBed } from '@angular/core/testing';
import { DataspaceFormComponent } from './dataspace-form.component';

describe('DataspaceFormComponent', () => {
  it('rejects whitespace-only names and trims valid names', () => {
    const component = TestBed.runInInjectionContext(() => new DataspaceFormComponent());
    const save = jasmine.createSpy('save');
    component.save.subscribe(save);

    component.form.controls.name.setValue('   ');
    expect(component.form.invalid).toBeTrue();
    component.submit();
    expect(save).not.toHaveBeenCalled();

    component.form.controls.name.setValue('  Example  ');
    expect(component.form.valid).toBeTrue();
    component.submit();
    expect(save).toHaveBeenCalledOnceWith({ name: 'Example' });
  });
});
