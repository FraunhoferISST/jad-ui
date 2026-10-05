# JAD policy profile seed

Temporary standalone Kubernetes Job, intended to move into the JAD
`jad-dataspace-profile` Helm chart later. It uses the existing platform
`seed-jobs` service account and has no Helm dependency.

## What it registers

After control-plane readiness and jwtlet token exchange, it checks the required
APIs, then creates or updates these resources in order:

1. **CachedDocument** `jad-policy-profile-v1-schema`: the root
   [`public/config/jad-profile.json`](../../public/config/jad-profile.json), cached as `JSON_SCHEMA` with URL
   `urn:jad:policy-profile:v1` and pull strategy `NEVER`.
2. **CEL expressions**, from [`cel-expressions.json`](cel-expressions.json):
   - `membership_expr` → `MembershipCredential` (JAD Bruno registration).
   - `manufacturer_expr` → `ManufacturerCredential` (JAD Bruno registration).
   - `cert-partner-access-policy-expression` → `CounterPartyId` (historical UI
     upload registration).
3. **SchemaValidatorRegistration** `jad-policy-profile-v1-validator`, bound to
   `v4:PolicyDefinition` with `profiles: []`, so the JAD schema applies to all
   policy-definition creation requests, including requests without a profile.

`v4` is deliberate: the v5 policy-definition creation endpoint still uses the
v4 schema-validation key. `inForceDate` is a built-in EDC evaluator, so this Job
registers no CEL replacement for it.

A rerun POSTs each resource and, on HTTP 409, PUTs its desired content under the
same ID. Thus reruns converge instead of silently retaining stale definitions.
Updating the validator binding last also evicts its compiled schema cache after
changes to the cached JSON document. These are not atomic cross-resource writes;
a failed run can leave earlier resources updated, and can be retried safely.
The Job manages only these five IDs and never deletes EDC resources. Existing
records must use those IDs; a schema URL already cached under a different ID
causes the Job to fail rather than overwrite an unrelated record.

## Prerequisites

- The `edc-v` namespace, control plane, jwtlet, and the platform-created
  `seed-jobs` service account must already exist.
- The service account must have the platform's jwtlet mapping to the `issuer`
  participant context with scope `admin` and audience `edcv`. The exchanged token
  must grant `management-api:admin`.
- The control-plane image must include the document-cache, CEL API and
  schema-validation extensions, with persistent stores where persistence across
  restarts is needed. Required Management API endpoints are
  `/v5/cacheddocuments`, `/v5/celexpressions` and `/v5/schemavalidators`.
  Readiness alone does not prove these APIs are installed; the Job fails on a
  missing API or insufficient permission rather than claiming success.
- The existing JAD DCP scope configuration must request the membership and
  manufacturer credentials. This Job does not seed DCP scopes or issue VCs.

## Deploy / rerun

From the repository root, run the helper (requires Bash and kubectl):

```bash
bash ops/jad-profile-seed/deploy.sh
kubectl -n edc-v logs -f job/jad-profile-seed
kubectl -n edc-v wait --for=condition=complete job/jad-profile-seed --timeout=900s
```

Use an absolute path to the helper when outside the repository. It renders the
Kustomization, deletes only the previous `jad-profile-seed` Job (Jobs have an
immutable pod template), generates the schema ConfigMap directly from the root
JSON file, and applies the Job and generated code/settings ConfigMaps. No schema
copy or permissive Kustomize load restriction is needed. `kubectl apply -k` alone
requires the `jad-profile-schema` ConfigMap to have already been created.

Defaults target `controlplane.edc-v.svc.cluster.local:8081/api/mgmt` and
`jwtlet.edc-v.svc.cluster.local:8080/token`. Edit `kustomization.yaml` for a different
namespace, host, resource, scope, audience or timeout. The deployment helper
reads its namespace from that file. If changing the Kubernetes subject-token
audience or service account, also edit `job.yaml` to match the platform mapping.
Tokens are projected by Kubernetes and exchanged inside the Pod; no admin token
is stored in a manifest or logged. Transport errors, HTTP 429 and 5xx responses
have bounded retries; HTTP 401 triggers one token refresh. The Pod runs non-root
with a read-only root filesystem and no runtime package installation.

Finished Jobs (successful or failed) are removed after one hour; code, settings
and schema ConfigMaps remain. Retrieve logs before TTL cleanup. The deadline is
15 minutes.

## Validation and scope

The binding has an empty profile filter, so every `v4:PolicyDefinition` creation
request is checked against the JAD schema. `policy.profile` is optional; if
supplied, the schema requires the string `urn:jad:policy-profile:v1`. Existing
stored policies are not retroactively validated. Rerun the deployment helper to
update an older, profile-filtered binding in the control plane.

To test schema rejection without a profile, POST this one-permission body to
`/v5/participants/{participantContextId}/policydefinitions`:

```json
{"@context":["https://w3id.org/edc/connector/management/v2"],"@type":"PolicyDefinition","@id":"jad-schema-negative-test","policy":{"@type":"Set","permission":[{"action":"use","constraint":[{"leftOperand":"CounterPartyId","operator":"gteq","rightOperand":"test"}]}]}}
```

The operand is registered, but `gteq` violates the JAD schema's counterparty
operator restriction. Expect a schema-validation rejection. Change `gteq` to
`eq` for a valid control request (use a different ID if it already exists).
Policy creation does not verify that `test` identifies a real participant or
that a counterparty would satisfy this constraint at evaluation time.

This binding does not associate participants with a DSP runtime profile or
install a policy-builder UI. CEL registrations are global to the control plane
and apply in `catalog`, `contract.negotiation` and `transfer.process`, not
`policy.monitor`. Reruns overwrite manual edits to these managed expression IDs;
review the payloads before applying to production.

## Local checks

No Chrome, cluster, third-party Python dependencies, or sibling checkout required:

```bash
python3 -B -m unittest discover -s ops/jad-profile-seed -p 'test_*.py' -v
kubectl kustomize ops/jad-profile-seed > /tmp/jad-profile-seed.yaml
bash -n ops/jad-profile-seed/deploy.sh
```

Tests use a local HTTP server to check request bodies, jwtlet exchange,
registration order, convergent reruns, token refresh, retries, and failure paths.
When migrating to Helm, mount the same script and CEL payloads, package the root
schema as chart content, and replace the Kustomize settings with chart values.
Run after the platform's jwtlet/issuer seeds; no participant provisioning is
required for these global registrations.
