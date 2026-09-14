import { CelExpression, PolicySet } from '../models/redline-data.model';

export const PARTNER_ACCESS_EXPRESSION: CelExpression = {
  '@type': 'CelExpression',
  '@id': 'cert-partner-access-policy-expression',
  leftOperand: 'CounterPartyId',
  description: 'Evaluate counter party ID for certificate access',
  scopes: ['catalog', 'contract.negotiation', 'transfer.process'],
  expression:
    'type(this.rightOperand) == list ? ctx.agent.id in this.rightOperand : ctx.agent.id == this.rightOperand',
};

export function getAccessRestrictionPolicy(partnerIds: string[]): PolicySet {
  return {
    permission: [
      {
        action: 'use',
        constraint: [
          {
            leftOperand: 'CounterPartyId',
            operator: partnerIds.length > 1 ? 'isAnyOf' : 'eq',
            rightOperand: partnerIds.length > 1 ? partnerIds : partnerIds[0],
          },
        ],
      },
    ],
  };
}
