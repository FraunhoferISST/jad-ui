import { AbstractControl, FormArray, FormGroup, ValidationErrors } from '@angular/forms';

/**
 * Validator for a dataspaces {@link FormArray} that requires at least one
 * dataspace to be selected (i.e. a child group's `selected` control is `true`).
 *
 * Apply it to the array of dataspace-selection groups, for example:
 * `this.fb.array<FormGroup>([], atLeastOneDataspaceSelected)`.
 *
 * @param control - The dataspaces form array.
 * @returns `{ required: true }` when no dataspace is selected, otherwise `null`.
 */
export function atLeastOneDataspaceSelected(
  control: AbstractControl,
): ValidationErrors | null {
  const array = control as FormArray<FormGroup>;
  const anySelected = array.controls.some(
    group => group.get('selected')?.value === true,
  );
  return anySelected ? null : { required: true };
}
