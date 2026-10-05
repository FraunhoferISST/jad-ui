"""Seed JAD policy authoring validation and CEL evaluators using the EDC v5 API.

Standard library only, so the Kubernetes Job does not install packages at startup.
"""

import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


CONTEXT = ["https://w3id.org/edc/connector/management/v2"]
SCHEMA_DOCUMENT_ID = "jad-policy-profile-v1-schema"
VALIDATOR_ID = "jad-policy-profile-v1-validator"


class SeedError(RuntimeError):
    pass


class SeedClient:
    def __init__(self, env):
        self.base = env["EDC_BASE"].rstrip("/")
        self.readiness_url = env["EDC_READINESS_URL"]
        self.token_url = env["JWTLET_TOKEN_URL"]
        self.token_file = Path(env.get("JWTLET_TOKEN_FILE", "/var/run/secrets/jwtlet/token"))
        self.resource = env.get("JWTLET_RESOURCE", "issuer")
        self.scope = env.get("JWTLET_SCOPE", "admin")
        self.audience = env.get("JWTLET_AUDIENCE", "edcv")
        self.timeout = float(env.get("HTTP_TIMEOUT_SECONDS", "30"))
        self.readiness_timeout = float(env.get("READINESS_TIMEOUT_SECONDS", "300"))
        self.attempts = int(env.get("HTTP_ATTEMPTS", "5"))
        self.retry_delay = float(env.get("HTTP_RETRY_DELAY_SECONDS", "2"))
        if min(self.timeout, self.readiness_timeout, self.attempts) <= 0 or self.retry_delay < 0:
            raise SeedError("HTTP timeouts and attempts must be positive; retry delay cannot be negative")
        self.token = None

    def raw_request(self, method, url, data=None, headers=None):
        request = Request(url, data=data, headers=headers or {}, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return response.status, response.read()
        except HTTPError as error:
            with error:
                return error.code, error.read()

    def request(self, method, url, data=None, headers=None, allowed=()):
        # Retry only transport failures, rate limits and server errors. In particular,
        # unsupported endpoints and missing permissions must fail, not appear seeded.
        for attempt in range(self.attempts):
            try:
                status, body = self.raw_request(method, url, data, headers)
                if 200 <= status < 300 or status in allowed:
                    return status, body
                retry = status == 429 or 500 <= status < 600
                detail = f"HTTP {status}"
            except (URLError, OSError):
                retry = True
                detail = "transport failure"
            if not retry or attempt == self.attempts - 1:
                # Do not print response bodies: token-exchange errors can contain secrets.
                raise SeedError(f"{method} {url} failed ({detail})")
            print(f"Retrying {method} {url} after {detail}", flush=True)
            time.sleep(self.retry_delay * (2 ** attempt))
        raise AssertionError("unreachable")

    def wait_for_controlplane(self):
        print("Waiting for control-plane readiness", flush=True)
        deadline = time.monotonic() + self.readiness_timeout
        while time.monotonic() < deadline:
            try:
                status, _ = self.raw_request("GET", self.readiness_url)
                if 200 <= status < 300:
                    return
            except (URLError, OSError):
                pass
            time.sleep(min(5, max(0, deadline - time.monotonic())))
        raise SeedError("Control plane did not become ready before the readiness timeout")

    def exchange_token(self):
        # Re-read the projected token on refresh so Kubernetes rotation is respected.
        subject_token = self.token_file.read_text().strip()
        if not subject_token:
            raise SeedError("JWTlet subject token file is empty")
        data = urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
            "subject_token": subject_token,
            "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
            "resource": self.resource,
            "scope": self.scope,
            "audience": self.audience,
        }).encode()
        _, body = self.request(
            "POST", self.token_url, data,
            {"Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            token = json.loads(body).get("access_token")
        except (ValueError, AttributeError):
            token = None
        if not isinstance(token, str) or not token.strip():
            raise SeedError("JWTlet did not return an access_token")
        self.token = token

    def management(self, method, path, payload=None, allowed=()):
        data = json.dumps(payload).encode() if payload is not None else None
        for attempt in range(2):
            status, body = self.request(
                method, f"{self.base}/v5/{path}", data,
                {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
                allowed=(*allowed, 401),
            )
            if status != 401:
                return status, body
            if attempt == 0:
                self.exchange_token()
        raise SeedError("Management API rejected the refreshed JWTlet token (HTTP 401)")

    def upsert(self, collection, payload):
        identifier = payload["@id"]
        status, _ = self.management("POST", collection, payload, allowed=(409,))
        if status == 409:
            # A timeout after a successful POST is also safe: the retry gets 409 and
            # updates the same ID. Reapply the desired content instead of ignoring drift.
            path = f"{collection}/{quote(identifier, safe='')}"
            self.management("PUT", path, payload)
            action = "Updated"
        else:
            action = "Created"
        print(f"{action} {collection}/{identifier}", flush=True)


def seed(client, schema, expressions):
    profile = schema.get("$id")
    if not isinstance(profile, str) or not profile:
        raise SeedError("Schema must have a nonempty $id")
    if schema["$defs"]["Policy"]["properties"]["profile"].get("const") != profile:
        raise SeedError("Schema $id must match the Policy profile identifier")
    if not isinstance(expressions, list) or not expressions:
        raise SeedError("CEL registrations must be a nonempty array")
    for expression in expressions:
        if not all(isinstance(expression.get(key), str) and expression[key]
                   for key in ("@id", "leftOperand", "expression")):
            raise SeedError("Each CEL registration needs an ID, leftOperand and expression")

    client.wait_for_controlplane()
    client.exchange_token()
    # Check all required extensions before making any management-API writes.
    for collection in ("cacheddocuments", "schemavalidators"):
        client.management("GET", collection)
    client.management(
        "POST", "celexpressions/request",
        {"@context": CONTEXT, "@type": "QuerySpec", "limit": 1},
    )

    client.upsert("cacheddocuments", {
        "@context": CONTEXT,
        "@type": "CachedDocument",
        "@id": SCHEMA_DOCUMENT_ID,
        "url": profile,
        "documentType": "JSON_SCHEMA",
        "pullStrategy": "NEVER",
        "content": schema,
    })
    for expression in expressions:
        client.upsert("celexpressions", expression)
    # Bind last, after every CEL evaluator is available. PUT also evicts the
    # compiled schema validator cache when the cached document changed on a rerun.
    client.upsert("schemavalidators", {
        "@context": CONTEXT,
        "@type": "SchemaValidatorRegistration",
        "@id": VALIDATOR_ID,
        "version": "v4",  # The v5 PolicyDefinition controller uses the v4 validation key.
        "validatedType": "PolicyDefinition",
        "schema": profile,
        "profiles": [],  # Apply to every PolicyDefinition request, including those without a profile.
    })
    print(f"JAD policy profile {profile} seeded successfully", flush=True)


def main():
    try:
        schema = json.loads(Path(os.environ.get("SCHEMA_FILE", "/schema/jad-profile.json")).read_text())
        expressions = json.loads(Path(os.environ.get("CEL_FILE", "/seed/cel-expressions.json")).read_text())
        seed(SeedClient(os.environ), schema, expressions)
    except (SeedError, OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        print(f"ERROR: {error}", file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
