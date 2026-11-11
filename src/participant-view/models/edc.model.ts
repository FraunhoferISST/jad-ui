import { EdcConnectorClient } from '@think-it-labs/edc-connector-client';
import { V5ContractAgreementController } from '../edc-controllers/contract-agreements-v5.controller';

import { PolicyCreationController } from '../edc-controllers/policy-creation.controller';

export const EDC_CUSTOM_CONTROLLERS = {
  v5contractAgreements: V5ContractAgreementController,
  policyCreation: PolicyCreationController,
} as const;

export type ExtendedEdcClient = EdcConnectorClient & {
  [Key in keyof typeof EDC_CUSTOM_CONTROLLERS]: InstanceType<(typeof EDC_CUSTOM_CONTROLLERS)[Key]>;
};
