import { EdcConnectorClient } from "@think-it-labs/edc-connector-client";
import { CelExpressionsController } from "../edc-controllers/cel-expression.controller";
import { V5ContractAgreementController } from "../edc-controllers/contract-agreements-v5.controller";

import { PolicyCreationController } from '../edc-controllers/policy-creation.controller';

export type ExtendedEdcClient = EdcConnectorClient & {
  celExpressions: CelExpressionsController;
  v5contractAgreements: V5ContractAgreementController;
  policyCreation: PolicyCreationController;
};
