import { EdcController } from "@think-it-labs/edc-connector-client";
import { CelExpression } from "../models/redline-data.model";

export class CelExpressionsController extends EdcController {
  async create(expressions: CelExpression[]): Promise<void> {
    if (!this.context) {
      throw new Error('No EDC context available while creating CEL expressions.');
    }

    for(const exp of expressions) {
      exp['@context'] = ['https://w3id.org/edc/connector/management/v2'];
      await this.inner.request(this.context.management, {
        path: `/v5/celexpressions`,
        method: 'POST',
        authorization: this.context.authorization,
        body: exp,
      });
    }
  }
}

