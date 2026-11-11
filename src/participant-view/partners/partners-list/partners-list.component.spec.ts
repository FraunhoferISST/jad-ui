import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { RedlineService } from '../../../app/redline/redline.service';
import { ParticipantContextService } from '../../services/participant-context.service';
import { PartnerService } from '../../services/partner.service';
import { PartnersListComponent } from './partners-list.component';

describe('PartnersListComponent', () => {
  const context = {
    tenantId: 1,
    participantId: 1,
    participantIdentifier: 'did:web:me',
    tenantName: 'Me',
  };
  let partners: jasmine.SpyObj<PartnerService>;
  let redline: jasmine.SpyObj<RedlineService>;
  let modal: jasmine.SpyObj<ModalAndAlertService>;

  beforeEach(() => {
    partners = jasmine.createSpyObj('PartnerService', [
      'getDataspacePartners',
      'addPartner',
      'getPartners',
    ]);
    redline = jasmine.createSpyObj('RedlineService', ['listTenants']);
    modal = jasmine.createSpyObj('ModalAndAlertService', ['showAlert']);
    partners.getDataspacePartners.and.callFake(async () => [
      {
        dataspace: { id: 1, name: 'Catena-X' },
        partners: [{ identifier: 'did:web:existing', nickname: 'Existing' }],
      },
      { dataspace: { id: 2, name: 'Factory-X' }, partners: [] },
    ]);
    partners.addPartner.and.callFake(async (_dataspace, partner) => partner);
    redline.listTenants.and.resolveTo([
      { id: 1, providerId: 1, name: 'Me', participants: [{ id: 1, identifier: 'did:web:me' }] },
      {
        id: 2,
        providerId: 1,
        name: 'Acme',
        participants: [
          { id: 2, identifier: 'did:web:acme' },
          { id: 3, identifier: 'did:web:existing' },
        ],
      },
      { id: 3, providerId: 1, name: 'Beta', participants: [{ id: 4, identifier: 'did:web:beta' }] },
    ]);
    TestBed.configureTestingModule({
      imports: [PartnersListComponent],
      providers: [
        provideRouter([]),
        { provide: PartnerService, useValue: partners },
        { provide: RedlineService, useValue: redline },
        { provide: ParticipantContextService, useValue: { resolve: async () => context } },
        { provide: ModalAndAlertService, useValue: modal },
      ],
    });
  });

  async function create(): Promise<PartnersListComponent> {
    const fixture = TestBed.createComponent(PartnersListComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('groups partners per joined dataspace and preselects the first one', async () => {
    const component = await create();
    expect(component.groups().map((group) => group.dataspace.name)).toEqual([
      'Catena-X',
      'Factory-X',
    ]);
    expect(component.targetDataspace()?.dataspace.id).toBe(1);
    expect(component.partnerName('did:web:existing')).toBe('Acme');
    expect(component.partnerName('did:web:unknown')).toBe('did:web:unknown');
  });

  it('offers only participants that are not already partners of the target dataspace', async () => {
    const component = await create();
    expect(component.participantOptions().map((option) => option.participantIdentifier)).toEqual([
      'did:web:acme',
      'did:web:beta',
    ]);
    component.participantSearch.set('BETA');
    expect(component.filteredParticipants().map((option) => option.tenantName)).toEqual(['Beta']);
    component.participantSearch.set('');

    component.selectTargetDataspace(2);
    expect(component.targetDataspace()?.dataspace.id).toBe(2);
    expect(component.participantOptions().map((option) => option.participantIdentifier)).toEqual([
      'did:web:acme',
      'did:web:existing',
      'did:web:beta',
    ]);
  });

  it('filters partners across dataspace groups', async () => {
    const component = await create();
    component.partnerSearch.set('existing');
    expect(component.filteredGroups().map((group) => group.dataspace.id)).toEqual([1]);
    component.partnerSearch.set('unmatched');
    expect(component.filteredGroups()).toEqual([]);
  });

  it('adds selected participants to the target dataspace and reports the result', async () => {
    const component = await create();
    component.selectTargetDataspace(2);
    component.toggleParticipantSelection('did:web:beta');
    await component.addSelectedPartners();
    expect(partners.addPartner).toHaveBeenCalledOnceWith(2, {
      identifier: 'did:web:beta',
      nickname: 'Beta',
    });
    expect(component.selectedParticipants().size).toBe(0);
    expect(component.message(2)).toEqual({ text: '1 partner(s) added.', kind: 'success' });
  });

  it('reports backend messages when a partner cannot be added', async () => {
    partners.addPartner.and.rejectWith(
      new Error('Dataspace info not found for participant 3 and dataspace 1'),
    );
    const component = await create();
    component.toggleParticipantSelection('did:web:beta');
    await component.addSelectedPartners();
    expect(component.message(1)?.kind).toBe('error');
    expect(component.message(1)?.text).toContain('Dataspace info not found');
    expect(component.selectedParticipants().size).toBe(1);
  });

  it('creates an unregistered partner after validating the properties JSON', async () => {
    const component = await create();
    component.updateForm(1, { create: true, identifier: ' did:web:external ', properties: '[1]' });
    await component.addPartnerManually(1);
    expect(partners.addPartner).not.toHaveBeenCalled();
    expect(component.message(1)?.text).toBe('Properties must be a JSON object.');

    component.updateForm(1, {
      identifier: 'did:web:external',
      nickname: 'External',
      properties: '{"region":"EU"}',
    });
    await component.addPartnerManually(1);
    expect(partners.addPartner).toHaveBeenCalledOnceWith(1, {
      identifier: 'did:web:external',
      nickname: 'External',
      properties: { region: 'EU' },
    });
    expect(component.form(1)).toEqual({
      create: false,
      identifier: '',
      nickname: '',
      properties: '{}',
    });
  });

  it('blocks adding without a joined dataspace', async () => {
    partners.getDataspacePartners.and.resolveTo([]);
    const component = await create();
    expect(component.targetDataspace()).toBeNull();
    component.toggleParticipantSelection('did:web:beta');
    await component.addSelectedPartners();
    expect(partners.addPartner).not.toHaveBeenCalled();
  });

  it('reports load failures instead of showing stale results', async () => {
    const component = await create();
    redline.listTenants.and.rejectWith(new Error('Redline unavailable'));
    await component.loadData();
    expect(component.groups()).toEqual([]);
    expect(component.loading()).toBeFalse();
    expect(modal.showAlert).toHaveBeenCalledWith('Redline unavailable', 'Partners', 'error', 8);
  });
});
