import { TestBed } from '@angular/core/testing';
import { RedlineService } from '../../app/redline/redline.service';
import { DataspacePartners, PartnerService } from './partner.service';
import { ParticipantContextService } from './participant-context.service';

describe('PartnerService', () => {
  let service: PartnerService;
  let redline: jasmine.SpyObj<RedlineService>;
  const context = {
    tenantId: 7,
    participantId: 9,
    participantIdentifier: 'did:web:me',
    tenantName: 'Me',
  };

  beforeEach(() => {
    redline = jasmine.createSpyObj('RedlineService', [
      'getParticipantDataspaces',
      'getPartners',
      'createPartner',
    ]);
    redline.getParticipantDataspaces.and.resolveTo([
      { id: 2, name: 'First joined' },
      { id: 3, name: 'Catena-X' },
    ]);
    redline.getPartners.and.callFake(async (_tenant, _participant, dataspaceId) =>
      dataspaceId === 2
        ? [{ identifier: 'did:web:partner', nickname: 'Partner' }]
        : [{ identifier: 'did:web:partner', nickname: 'Partner' }, { identifier: 'did:web:other' }],
    );
    redline.createPartner.and.callFake(
      async (_tenant, _participant, _dataspace, partner) => partner,
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: RedlineService, useValue: redline },
        { provide: ParticipantContextService, useValue: { resolve: async () => context } },
      ],
    });
    service = TestBed.inject(PartnerService);
  });

  it('lists the joined dataspaces of the current participant', async () => {
    expect(await service.getJoinedDataspaces()).toEqual([
      { id: 2, name: 'First joined' },
      { id: 3, name: 'Catena-X' },
    ]);
    expect(redline.getParticipantDataspaces).toHaveBeenCalledOnceWith(7, 9);
  });

  it('loads each joined dataspace with its own partner references', async () => {
    const groups: DataspacePartners[] = await service.getDataspacePartners();
    expect(groups.map((group) => group.dataspace.id)).toEqual([2, 3]);
    expect(groups[0].partners.length).toBe(1);
    expect(groups[1].partners.length).toBe(2);
    expect(redline.getPartners).toHaveBeenCalledWith(7, 9, 2);
    expect(redline.getPartners).toHaveBeenCalledWith(7, 9, 3);
  });

  it('returns [] per dataspace when the participant has joined nothing', async () => {
    redline.getParticipantDataspaces.and.resolveTo([]);
    expect(await service.getDataspacePartners()).toEqual([]);
    expect(await service.getPartners()).toEqual([]);
    expect(redline.getPartners).not.toHaveBeenCalled();
  });

  it('deduplicates partners that appear in several dataspaces', async () => {
    expect(await service.getPartners()).toEqual([
      { identifier: 'did:web:partner', nickname: 'Partner' },
      { identifier: 'did:web:other' },
    ]);
  });

  it('adds partners to the requested dataspace, not to an implicit first one', async () => {
    const partner = { identifier: 'did:web:new', nickname: 'New' };
    expect(await service.addPartner(3, partner)).toEqual(partner);
    expect(redline.createPartner).toHaveBeenCalledOnceWith(7, 9, 3, partner);
  });

  it('propagates backend errors instead of masking them as an empty list', async () => {
    redline.getParticipantDataspaces.and.resolveTo([{ id: 2, name: 'First joined' }]);
    redline.getPartners.and.rejectWith(new Error('unavailable'));
    await expectAsync(service.getDataspacePartners()).toBeRejectedWithError('unavailable');
    await expectAsync(service.getPartners()).toBeRejectedWithError('unavailable');
  });
});
