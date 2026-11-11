import { TestBed } from '@angular/core/testing';
import { Participant } from '../../../app/redline/redline.models';
import { isParticipantActive } from '../../util/deployment.util';
import { TenantCardComponent } from './tenant-card.component';

describe('TenantCardComponent agent data', () => {
  it('handles agent type and state omitted by Redline', () => {
    const component = TestBed.runInInjectionContext(() => new TenantCardComponent());
    const participant: Participant = {
      id: 1,
      identifier: 'did:web:participant',
      agents: [{ id: 2, type: 'connector', state: 'ACTIVE' }, { id: 3 }],
    };
    expect(component.sortedAgents(participant).map((agent) => agent.id)).toEqual([3, 2]);
    expect(component.agentBadgeColor({ id: 3 })).toBe('badge-ghost');
    expect(isParticipantActive(participant)).toBeFalse();
  });
});
