import io
import json
import os
import subprocess
import tempfile
import threading
import unittest
from collections import defaultdict, deque
from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError
from urllib.parse import parse_qs, unquote, urlsplit

import seed


DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parent.parent


class FakeApi:
    def __init__(self):
        self.resources = {}
        self.calls = []
        self.responses = defaultdict(deque)
        self.exchanges = 0

    def handle(self, method, path, data, headers):
        payload = parse_qs(data.decode()) if path == "/token" else json.loads(data) if data else None
        self.calls.append((method, path, payload, headers))
        if self.responses[method, path]:
            return self.responses[method, path].popleft()
        if path == "/readiness":
            return 200, b"ready"
        if path == "/token":
            self.exchanges += 1
            return 200, json.dumps({"access_token": f"management-secret-{self.exchanges}"}).encode()
        if method == "GET" or path == "/api/mgmt/v5/celexpressions/request":
            return 200, b"[]"
        parts = path.removeprefix("/api/mgmt/v5/").split("/")
        identifier = payload["@id"] if method == "POST" else unquote(parts[1])
        key = (parts[0], identifier)
        if method == "POST" and key in self.resources:
            return 409, b"already present"
        if method == "PUT" and key not in self.resources:
            return 404, b"unknown resource ID"
        self.resources[key] = payload
        return (204, b"") if method == "PUT" else (200, b'{"@id":"created"}')

    def writes(self):
        return [call for call in self.calls
                if call[0] in ("POST", "PUT") and call[1].startswith("/api/mgmt/v5/")
                and not call[1].endswith("/request")]


class SeedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.token_file = Path(self.temp.name) / "token"
        self.token_file.write_text("kubernetes-subject-secret")
        self.schema = json.loads((ROOT / "public/config/jad-profile.json").read_text())
        self.expressions = json.loads((DIRECTORY / "cel-expressions.json").read_text())
        self.api = FakeApi()
        api = self.api

        class Handler(BaseHTTPRequestHandler):
            def respond(self):
                data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                status, body = api.handle(self.command, self.path, data, dict(self.headers))
                self.send_response(status)
                self.end_headers()
                self.wfile.write(body)

            do_GET = respond
            do_POST = respond
            do_PUT = respond

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.01), daemon=True)
        thread.start()

        def stop_server():
            server.shutdown()
            server.server_close()
            thread.join()

        self.addCleanup(stop_server)
        base = f"http://127.0.0.1:{server.server_port}"
        self.env = {
            "EDC_BASE": base + "/api/mgmt/",
            "EDC_READINESS_URL": base + "/readiness",
            "JWTLET_TOKEN_URL": base + "/token",
            "JWTLET_TOKEN_FILE": str(self.token_file),
            "HTTP_RETRY_DELAY_SECONDS": "0",
            "HTTP_ATTEMPTS": "2",
        }
        self.client = seed.SeedClient(self.env)

    def run_seed(self):
        with redirect_stdout(io.StringIO()):
            seed.seed(self.client, self.schema, self.expressions)

    def test_creates_cache_then_three_evaluators_then_validator(self):
        self.run_seed()
        writes = self.api.writes()
        self.assertEqual([call[1].rsplit("/", 1)[-1] for call in writes], [
            "cacheddocuments", "celexpressions", "celexpressions", "celexpressions", "schemavalidators",
        ])
        self.assertEqual(len(self.api.resources), 5)
        document = writes[0][2]
        self.assertEqual(document["content"], self.schema)
        self.assertEqual(document["url"], self.schema["$id"])
        self.assertEqual(document["documentType"], "JSON_SCHEMA")
        self.assertEqual(document["pullStrategy"], "NEVER")
        validator = writes[-1][2]
        self.assertEqual(validator["version"], "v4")
        self.assertEqual(validator["validatedType"], "PolicyDefinition")
        self.assertEqual(validator["schema"], document["url"])
        self.assertEqual(validator["profiles"], [])
        exchange = next(call for call in self.api.calls if call[1] == "/token")
        self.assertEqual(exchange[2]["resource"], ["issuer"])
        self.assertEqual(exchange[2]["scope"], ["admin"])
        self.assertEqual(exchange[2]["audience"], ["edcv"])
        for call in writes:
            self.assertEqual(call[3]["Authorization"], "Bearer management-secret-1")

    def test_rerun_updates_existing_content_and_evicts_validator_last(self):
        self.run_seed()
        # Simulate the old profile-filtered binding already deployed in the cluster.
        self.api.resources["schemavalidators", seed.VALIDATOR_ID]["profiles"] = [self.schema["$id"]]
        self.api.calls.clear()
        self.schema["description"] = "Updated schema"
        self.expressions[0]["description"] = "Updated CEL metadata"
        self.run_seed()
        updates = [call for call in self.api.writes() if call[0] == "PUT"]
        self.assertEqual(len(updates), 5)
        self.assertTrue(updates[-1][1].endswith("schemavalidators/" + seed.VALIDATOR_ID))
        self.assertEqual(updates[-1][2]["profiles"], [])
        self.assertEqual(updates[0][2]["content"]["description"], "Updated schema")
        self.assertEqual(updates[1][2]["description"], "Updated CEL metadata")
        self.assertEqual(len(self.api.resources), 5)

    def test_missing_extension_fails_before_any_writes(self):
        self.api.responses["GET", "/api/mgmt/v5/schemavalidators"].append((404, b"missing extension"))
        with self.assertRaisesRegex(seed.SeedError, "HTTP 404"):
            self.run_seed()
        self.assertEqual(self.api.writes(), [])

    def test_forbidden_does_not_retry_or_write(self):
        self.api.responses["GET", "/api/mgmt/v5/cacheddocuments"].append((403, b"missing admin scope"))
        with self.assertRaisesRegex(seed.SeedError, "HTTP 403"):
            self.run_seed()
        self.assertEqual(self.api.writes(), [])
        self.assertEqual(self.api.exchanges, 1)

    def test_failed_cel_registration_does_not_bind_schema(self):
        self.api.responses["POST", "/api/mgmt/v5/celexpressions"].append((400, b"invalid CEL"))
        with self.assertRaisesRegex(seed.SeedError, "HTTP 400"):
            self.run_seed()
        self.assertNotIn(("schemavalidators", seed.VALIDATOR_ID), self.api.resources)

    def test_expired_token_is_refreshed_once(self):
        self.api.responses["GET", "/api/mgmt/v5/cacheddocuments"].append((401, b"expired"))
        self.run_seed()
        self.assertEqual(self.api.exchanges, 2)
        self.assertEqual(self.api.writes()[0][3]["Authorization"], "Bearer management-secret-2")

    def test_invalid_refreshed_token_fails(self):
        self.api.responses["GET", "/api/mgmt/v5/cacheddocuments"].extend([(401, b"expired")] * 2)
        with self.assertRaisesRegex(seed.SeedError, "refreshed JWTlet token"):
            self.run_seed()
        self.assertEqual(self.api.exchanges, 2)
        self.assertEqual(self.api.writes(), [])

    def test_transient_failure_is_retried(self):
        self.api.responses["POST", "/api/mgmt/v5/cacheddocuments"].append((503, b"not ready"))
        self.run_seed()
        posts = [call for call in self.api.writes() if call[1].endswith("cacheddocuments")]
        self.assertEqual(len(posts), 2)
        self.assertEqual(len(self.api.resources), 5)

    def test_transport_failure_has_bounded_retries(self):
        with patch.object(self.client, "raw_request", side_effect=URLError("private details")) as request:
            with redirect_stdout(io.StringIO()), self.assertRaisesRegex(seed.SeedError, "transport failure"):
                self.client.request("GET", self.client.base)
        self.assertEqual(request.call_count, 2)

    def test_readiness_wait_is_bounded(self):
        self.api.responses["GET", "/readiness"].append((503, b"starting"))
        self.client.readiness_timeout = 1
        with patch("seed.time.monotonic", side_effect=[0, 0, 1, 1]):
            with redirect_stdout(io.StringIO()), self.assertRaisesRegex(seed.SeedError, "readiness timeout"):
                self.client.wait_for_controlplane()
        self.assertEqual(self.api.writes(), [])

    def test_empty_subject_token_is_rejected(self):
        self.token_file.write_text("\n")
        with self.assertRaisesRegex(seed.SeedError, "empty"):
            self.run_seed()
        self.assertFalse(any(call[1] == "/token" for call in self.api.calls))

    def test_exchange_error_does_not_leak_secrets(self):
        self.api.responses["POST", "/token"].append((400, b"kubernetes-subject-secret"))
        with self.assertRaises(seed.SeedError) as error:
            self.run_seed()
        self.assertNotIn("kubernetes-subject-secret", str(error.exception))

    def test_missing_access_token_is_rejected(self):
        self.api.responses["POST", "/token"].append((200, b'{"token_type":"Bearer"}'))
        with self.assertRaisesRegex(seed.SeedError, "access_token"):
            self.run_seed()
        self.assertEqual(self.api.writes(), [])

    def test_invalid_profile_is_rejected_before_network_calls(self):
        self.schema["$id"] = "urn:other"
        with self.assertRaisesRegex(seed.SeedError, "must match"):
            self.run_seed()
        self.assertEqual(self.api.calls, [])

    def test_payloads_match_documented_profile_and_historical_partner_expression(self):
        self.assertEqual([expression["@id"] for expression in self.expressions], [
            "membership_expr", "manufacturer_expr", "cert-partner-access-policy-expression",
        ])
        self.assertEqual(len({expression["leftOperand"] for expression in self.expressions}), 3)
        for expression in self.expressions:
            definition = self.schema["$defs"][expression["leftOperand"] + "Constraint"]
            self.assertIn(expression["expression"], definition["$comment"])
            self.assertEqual(expression["scopes"], ["catalog", "contract.negotiation", "transfer.process"])
        historical_source = (ROOT / "src/participant-view/utils/policy.utils.ts").read_text()
        self.assertIn(self.expressions[-1]["expression"], historical_source)

    def test_deploy_script_uses_public_schema_and_recreates_only_its_job(self):
        directory = Path(self.temp.name)
        log = directory / "kubectl-calls.jsonl"
        kubectl = directory / "kubectl"
        kubectl.write_text("""#!/usr/bin/env python3
import json, os, sys
with open(os.environ['KUBECTL_TEST_LOG'], 'a') as log:
    log.write(json.dumps(sys.argv[1:]) + '\\n')
if sys.argv[1] == 'kustomize':
    print('apiVersion: batch/v1\\nkind: Job\\nmetadata:\\n  name: jad-profile-seed')
elif 'create' in sys.argv:
    print('apiVersion: v1\\nkind: ConfigMap\\nmetadata:\\n  name: jad-profile-schema')
elif sys.argv[-1] == '-':
    sys.stdin.read()
""")
        kubectl.chmod(0o755)
        subprocess.run(["bash", str(DIRECTORY / "deploy.sh")], check=True, cwd=directory,
                       env={**os.environ, "PATH": f"{directory}:{os.environ['PATH']}",
                            "KUBECTL_TEST_LOG": str(log)}, capture_output=True, text=True)
        calls = [json.loads(line) for line in log.read_text().splitlines()]
        self.assertEqual(calls[0], ["kustomize", str(DIRECTORY)])
        self.assertEqual(calls[1], ["-n", "edc-v", "delete", "job", "jad-profile-seed", "--ignore-not-found", "--wait=true"])
        create = next(call for call in calls if "create" in call)
        self.assertIn(f"--from-file=jad-profile.json={ROOT / 'public/config/jad-profile.json'}", create)


if __name__ == "__main__":
    unittest.main()
