import {
  ContractAgreement,
  EdcController,
  JsonLdService,
  MANAGEMENT_V2_CONTEXT,
  QuerySpec,
} from '@think-it-labs/edc-connector-client';

export class V5ContractAgreementController extends EdcController {
  private readonly jsonLdService = new JsonLdService();

  async queryAll(spec: QuerySpec): Promise<ContractAgreement[]> {
    if (!this.context) {
      throw new Error('No EDC context available while querying contract agreements.');
    }

    const body = await this.inner.request<unknown[]>(this.context.management, {
      path: `/${this.context.managementApiVersion}/contractagreements/request`,
      method: 'POST',
      authorization: this.context.authorization,
      body: {
        '@context': [MANAGEMENT_V2_CONTEXT],
        ...spec,
      },
    });

    // The management endpoint returns raw JSON-LD. Expand it into typed entities so
    // accessors such as `id` (from `@id`) resolve; otherwise `agreement.id` is undefined
    // and transfers cannot be matched to agreements.
    return this.jsonLdService.expandArray(body, () => new ContractAgreement());
  }
}
