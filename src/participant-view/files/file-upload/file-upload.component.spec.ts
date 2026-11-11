import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EdcClientService, ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { ContractDefinition, PolicyDefinition } from '@think-it-labs/edc-connector-client';

import { PartnerService } from '../../services/partner.service';
import { ParticipantConfigService } from '../../services/participant-config.service';
import { UploadService } from '../../services/upload.service';
import { FileUploadComponent } from './file-upload.component';

describe('FileUploadComponent contract selection', () => {
  let getPolicy: jasmine.Spy;
  let queryDefinitions: jasmine.Spy;
  let getPartners: jasmine.Spy;
  let uploadFile: jasmine.Spy;
  let showAlert: jasmine.Spy;
  const file = new File(['test'], 'report.txt', { type: 'text/plain' });

  function definition(id: string, accessPolicyId: string): ContractDefinition {
    const result = new ContractDefinition();
    result.id = id;
    result.setValue('edc', 'accessPolicyId', accessPolicyId);
    result.setValue('edc', 'contractPolicyId', 'open');
    return result;
  }

  function policy(partnerId?: string): PolicyDefinition {
    return Object.assign(new PolicyDefinition(), {
      'https://w3id.org/edc/v0.0.1/ns/policy': [
        {
          '@type': 'Set',
          permission: [
            {
              action: 'use',
              constraint: partnerId
                ? [
                    {
                      leftOperand: 'CounterPartyId',
                      operator: 'eq',
                      rightOperand: partnerId,
                    },
                  ]
                : [],
            },
          ],
        },
      ],
    });
  }

  beforeEach(() => {
    const policies = new Map([
      ['restricted-alice', policy('did:web:alice')],
      ['restricted-bob', policy('did:web:bob')],
      ['open', policy()],
    ]);
    getPolicy = jasmine.createSpy('getPolicy').and.callFake(async (id: string) => policies.get(id));
    getPartners = jasmine.createSpy('getPartners').and.resolveTo([
      { identifier: 'did:web:alice', nickname: 'Alice Ltd' },
      { identifier: 'did:web:bob', nickname: 'Bob Ltd' },
    ]);
    queryDefinitions = jasmine
      .createSpy('queryDefinitions')
      .and.resolveTo([
        definition('Beta sharing', 'restricted-bob'),
        definition('Alpha sharing', 'restricted-alice'),
      ]);
    uploadFile = jasmine.createSpy('uploadFile').and.resolveTo();
    showAlert = jasmine.createSpy('showAlert');
    TestBed.configureTestingModule({
      imports: [FileUploadComponent],
      providers: [
        {
          provide: EdcClientService,
          useValue: {
            getClient: async () => ({
              management: {
                contractDefinitions: { queryAll: queryDefinitions },
                policyDefinitions: { get: getPolicy },
              },
            }),
          },
        },
        { provide: PartnerService, useValue: { getPartners } },
        { provide: UploadService, useValue: { uploadFile } },
        { provide: ModalAndAlertService, useValue: { showAlert } },
        {
          provide: ParticipantConfigService,
          useValue: {
            getUploadConfig: async () => ({
              maxFileSize: 1024,
              allowedFileTypes: ['text/plain'],
            }),
          },
        },
      ],
    });
  });

  async function create(): Promise<ComponentFixture<FileUploadComponent>> {
    const fixture = TestBed.createComponent(FileUploadComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    return fixture;
  }

  async function showDefinitions(fixture: ComponentFixture<FileUploadComponent>): Promise<void> {
    fixture.componentInstance.selectedFiles.set([file]);
    fixture.componentInstance.nextStep();
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
  }

  async function selectContract(
    fixture: ComponentFixture<FileUploadComponent>,
    index: number,
  ): Promise<void> {
    const radio: HTMLInputElement = fixture.nativeElement.querySelector(
      `#upload-contract-definition-${index}`,
    );
    radio.closest('label')!.click();
    await fixture.whenStable();
  }

  it('loads each referenced policy once and retains upload configuration', async () => {
    const fixture = await create();
    expect(
      getPolicy.calls
        .allArgs()
        .map((args) => args[0])
        .sort(),
    ).toEqual(['open', 'restricted-alice', 'restricted-bob']);
    expect(getPartners).toHaveBeenCalledOnceWith();
    expect(fixture.componentInstance.maxFileSize()).toBe(1024);
    expect(fixture.componentInstance.allowedFileTypes()).toEqual(['text/plain']);
    expect(fixture.componentInstance.loading()).toBeFalse();
  });

  it('lists only contracts on the left and prompts for selection on the right', async () => {
    const fixture = await create();
    await showDefinitions(fixture);
    const list: HTMLElement = fixture.nativeElement.querySelector('#upload-contract-list');
    const details: HTMLElement = fixture.nativeElement.querySelector('#upload-contract-sharing');
    const rows = [...list.querySelectorAll('li.list-row')];
    expect(rows.length).toBe(2);
    expect(rows[0].textContent?.trim()).toBe('Alpha sharing');
    expect(rows[1].textContent?.trim()).toBe('Beta sharing');
    expect(list.textContent).not.toContain('Alice Ltd');
    expect(list.textContent).not.toContain('Bob Ltd');
    expect(details.textContent).toContain('Select a contract to view its shared partners.');
    expect(details.textContent).not.toContain('did:web:alice');
    expect(fixture.componentInstance.selectedDefinition()).toBeUndefined();
    expect(fixture.componentInstance.canProceed()).toBeFalse();
    for (const radio of list.querySelectorAll('input')) {
      expect(radio.closest('label')?.textContent?.trim()).toBeTruthy();
      expect(radio.getAttribute('aria-controls')).toBe(details.id);
    }
    expect(details.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('aligns the panes and uses consistent padding without a visible list heading', async () => {
    queryDefinitions.and.resolveTo([definition('consumer-share', 'restricted-alice')]);
    const fixture = await create();
    await showDefinitions(fixture);
    const list: HTMLElement = fixture.nativeElement.querySelector('#upload-contract-list');
    const details: HTMLElement = fixture.nativeElement.querySelector('#upload-contract-sharing');
    const label = list.querySelector('label')!;
    const radio = label.querySelector('input')!;
    const title = label.querySelector('span')!;
    expect(list.getAttribute('aria-label')).toBe('Contracts');
    expect(list.parentElement).toBe(details.parentElement);
    expect(list.parentElement?.querySelector('h2')).toBeNull();
    expect(getComputedStyle(label).paddingTop).toBe(getComputedStyle(details).paddingTop);
    const radioRect = radio.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    expect(
      Math.abs((radioRect.top + radioRect.bottom - titleRect.top - titleRect.bottom) / 2),
    ).toBeLessThan(1);

    const listRect = list.getBoundingClientRect();
    const detailsRect = details.getBoundingClientRect();
    if (window.matchMedia('(min-width: 48rem)').matches) {
      expect(Math.abs(listRect.top - detailsRect.top)).toBeLessThan(1);
      expect(Math.abs(listRect.height - detailsRect.height)).toBeLessThan(1);
      expect(detailsRect.left).toBeGreaterThan(listRect.right);
    } else {
      expect(detailsRect.top).toBeGreaterThan(listRect.bottom);
      expect(Math.abs(listRect.left - detailsRect.left)).toBeLessThan(1);
      expect(Math.abs(listRect.width - detailsRect.width)).toBeLessThan(1);
    }

    await selectContract(fixture, 0);
    if (window.matchMedia('(min-width: 48rem)').matches) {
      expect(
        Math.abs(list.getBoundingClientRect().top - details.getBoundingClientRect().top),
      ).toBeLessThan(1);
    }
    const form: HTMLElement = fixture.nativeElement.querySelector('form');
    expect(form.scrollWidth).toBeLessThanOrEqual(form.clientWidth);
  });

  it('updates the partner panel and selected row when a contract is selected', async () => {
    const fixture = await create();
    await showDefinitions(fixture);
    const list: HTMLElement = fixture.nativeElement.querySelector('#upload-contract-list');
    const details: HTMLElement = fixture.nativeElement.querySelector('#upload-contract-sharing');
    const rows = [...list.querySelectorAll('li.list-row')];
    await selectContract(fixture, 0);
    expect(details.innerText.replace(/\s+/g, ' ').trim()).toBe('1 partner Alice Ltd');
    expect([...details.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
      'Alice Ltd',
    ]);
    expect(rows[0].classList.contains('bg-base-200')).toBeTrue();
    expect(fixture.componentInstance.canProceed()).toBeTrue();

    await selectContract(fixture, 1);
    expect(details.innerText.replace(/\s+/g, ' ').trim()).toBe('1 partner Bob Ltd');
    expect([...details.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
      'Bob Ltd',
    ]);
    expect(rows[0].classList.contains('bg-base-200')).toBeFalse();
    expect(rows[1].classList.contains('bg-base-200')).toBeTrue();
    expect(list.querySelectorAll('input:checked').length).toBe(1);
    expect(list.textContent).not.toContain('Bob Ltd');
    expect(list.textContent).not.toContain('restricted-bob');
  });

  it('shows just a count and names for multiple partners', async () => {
    const fixture = await create();
    fixture.componentInstance.contractSharing.update((current) =>
      new Map(current).set('Alpha sharing', {
        summary: '2 partners',
        partners: [
          { identifier: 'did:web:alice', nickname: 'Alice Ltd' },
          { identifier: 'did:web:bob', nickname: 'Bob Ltd' },
        ],
      }),
    );
    await showDefinitions(fixture);
    await selectContract(fixture, 0);
    const details: HTMLElement = fixture.nativeElement.querySelector('#upload-contract-sharing');
    expect(details.innerText.replace(/\s+/g, ' ').trim()).toBe('2 partners Alice Ltd Bob Ltd');
    expect([...details.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
      'Alice Ltd',
      'Bob Ltd',
    ]);
  });

  it('keeps the contract and sharing details when returning from Review', async () => {
    const fixture = await create();
    await showDefinitions(fixture);
    await selectContract(fixture, 1);
    const continueButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('button[type="submit"]');
    continueButton.click();
    await fixture.whenStable();
    const previous = [...fixture.nativeElement.querySelectorAll('button')].find(
      (button: HTMLButtonElement) => button.textContent?.trim() === 'Previous',
    ) as HTMLButtonElement;
    previous.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#upload-contract-definition-1').checked).toBeTrue();
    expect(fixture.nativeElement.querySelector('#upload-contract-sharing').textContent).toContain(
      'Bob Ltd',
    );
    expect(
      fixture.nativeElement.querySelector('#upload-contract-sharing').textContent,
    ).not.toContain('Alice Ltd');
  });

  it('keeps the selected audience on Review and uploads with the same definition ID', async () => {
    const fixture = await create();
    await showDefinitions(fixture);
    await selectContract(fixture, 1);
    expect(fixture.componentInstance.selectedDefinition()?.id).toBe('Beta sharing');
    expect(fixture.componentInstance.canProceed()).toBeTrue();
    const continueButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('button[type="submit"]');
    continueButton.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Bob Ltd');
    expect(fixture.nativeElement.textContent).not.toContain('Alice Ltd');
    expect(fixture.nativeElement.textContent).toContain('Contract definition: Beta sharing');
    const uploaded = jasmine.createSpy('uploaded');
    fixture.componentInstance.uploaded.subscribe(uploaded);
    const finish: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    finish.click();
    await fixture.whenStable();
    expect(uploadFile).toHaveBeenCalledOnceWith(file, 'Beta sharing');
    expect(uploaded).toHaveBeenCalledOnceWith(1);
  });

  it('keeps definitions selectable when a policy preview cannot be loaded', async () => {
    getPolicy.and.callFake(async (id: string) => {
      if (id === 'restricted-alice') throw new Error('Policy unavailable');
      return policy('did:web:bob');
    });
    const fixture = await create();
    await showDefinitions(fixture);
    expect(fixture.nativeElement.querySelectorAll('input[type="radio"]').length).toBe(2);
    expect(fixture.componentInstance.loading()).toBeFalse();
    expect(showAlert).not.toHaveBeenCalled();
    await selectContract(fixture, 0);
    const details: HTMLElement = fixture.nativeElement.querySelector('#upload-contract-sharing');
    expect(details.textContent).toContain('Partner access unavailable');
    expect(fixture.componentInstance.canProceed()).toBeTrue();
  });

  it('retains the empty-state guidance and blocks continuing without a definition', async () => {
    queryDefinitions.and.resolveTo([]);
    const fixture = await create();
    await showDefinitions(fixture);
    expect(fixture.nativeElement.textContent).toContain(
      'Ask a tenant admin to create a contract definition',
    );
    expect(fixture.nativeElement.querySelector('input[type="radio"]')).toBeNull();
    expect(fixture.componentInstance.canProceed()).toBeFalse();
    expect(getPolicy).not.toHaveBeenCalled();
  });

  it('falls back to participant identifiers when partner names are unavailable', async () => {
    getPartners.and.resolveTo([]);
    const fixture = await create();
    await showDefinitions(fixture);
    await selectContract(fixture, 0);
    expect(fixture.nativeElement.querySelector('#upload-contract-sharing').textContent).toContain(
      'did:web:alice',
    );
    await selectContract(fixture, 1);
    expect(fixture.nativeElement.querySelector('#upload-contract-sharing').textContent).toContain(
      'did:web:bob',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Alice Ltd');
  });
});
