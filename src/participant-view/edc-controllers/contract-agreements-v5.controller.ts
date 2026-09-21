import { EdcController, QuerySpec, ContractAgreement, MANAGEMENT_V2_CONTEXT } from "@think-it-labs/edc-connector-client";

export class V5ContractAgreementController extends EdcController {
  async queryAll(spec: QuerySpec): Promise<ContractAgreement[]> {
    if (!this.context) {
      throw new Error('No EDC context available while querying contract agreements.');
    }

    return await this.inner.request(this.context.management, {
      path: `/${this.context.managementApiVersion}/contractagreements/request`,
      method: 'POST',
      authorization: this.context.authorization,
      body: {
        "@context": [MANAGEMENT_V2_CONTEXT],
        ...spec
      },
    });
  }
}
