import { EdcConnectorClient } from '@think-it-labs/edc-connector-client';
import { V5ContractAgreementController } from '../edc-controllers/contract-agreements-v5.controller';

import { PolicyCreationController } from '../edc-controllers/policy-creation.controller';

export type ExtendedEdcClient = EdcConnectorClient & {
  v5contractAgreements: V5ContractAgreementController;
  policyCreation: PolicyCreationController;
};
