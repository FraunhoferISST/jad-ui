#!/usr/bin/env bash

set -euo pipefail

JAD_BASE_URL=${JAD_BASE_URL:-http://jad.localhost}
JWTLET_NAMESPACE=${JWTLET_NAMESPACE:-edc-v}
JWTLET_SERVICE=${JWTLET_SERVICE:-jwtlet}
JWTLET_LOCAL_PORT=${JWTLET_LOCAL_PORT:-8081}
JWTLET_REMOTE_PORT=${JWTLET_REMOTE_PORT:-8081}
JWTLET_SA=${JWTLET_SA:-cfm-agents}

KEYCLOAK_BASE_URL=${KEYCLOAK_BASE_URL:-http://keycloak.jad.localhost}
KEYCLOAK_REALM=${KEYCLOAK_REALM:-jad-dev}
KEYCLOAK_ADMIN_REALM=${KEYCLOAK_ADMIN_REALM:-master}
KEYCLOAK_ADMIN_CLIENT_ID=${KEYCLOAK_ADMIN_CLIENT_ID:-admin-cli}
KEYCLOAK_ADMIN_USERNAME=${KEYCLOAK_ADMIN_USERNAME:-admin}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-admin-dev-change-me}
KEYCLOAK_PARTICIPANT_ROLE=${KEYCLOAK_PARTICIPANT_ROLE:-participant}

PF_PID=""

cleanup() {
  if [[ -n "${PF_PID}" ]] && kill -0 "${PF_PID}" 2>/dev/null; then
    kill "${PF_PID}" 2>/dev/null || true
    wait "${PF_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd kubectl
require_cmd curl
require_cmd jq

echo "Creating service-account token for jwtlet lookup..."
ST=$(kubectl create token "${JWTLET_SA}" -n "${JWTLET_NAMESPACE}" --audience="https://kubernetes.default.svc.cluster.local")

echo "Starting port-forward to ${JWTLET_SERVICE}..."
kubectl port-forward -n "${JWTLET_NAMESPACE}" "svc/${JWTLET_SERVICE}" "${JWTLET_LOCAL_PORT}:${JWTLET_REMOTE_PORT}" >/tmp/jwtlet-portforward.log 2>&1 &
PF_PID=$!
sleep 3

if ! kill -0 "${PF_PID}" 2>/dev/null; then
  echo "Port-forward failed. Check /tmp/jwtlet-portforward.log" >&2
  exit 1
fi

echo "Fetching Keycloak admin token..."
KC_ADMIN_TOKEN=$(curl -sS -X POST \
  "${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_ADMIN_REALM}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "client_id=${KEYCLOAK_ADMIN_CLIENT_ID}" \
  --data-urlencode "username=${KEYCLOAK_ADMIN_USERNAME}" \
  --data-urlencode "password=${KEYCLOAK_ADMIN_PASSWORD}" \
  --data-urlencode "grant_type=password" \
  | jq -r '.access_token')

if [[ -z "${KC_ADMIN_TOKEN}" || "${KC_ADMIN_TOKEN}" == "null" ]]; then
  echo "Failed to obtain Keycloak admin token." >&2
  exit 1
fi

KC_ROLE=$(curl -sS \
  -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
  "${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/roles/${KEYCLOAK_PARTICIPANT_ROLE}")

if [[ "$(echo "${KC_ROLE}" | jq -r '.name // empty')" != "${KEYCLOAK_PARTICIPANT_ROLE}" ]]; then
  echo "Failed to resolve Keycloak realm role '${KEYCLOAK_PARTICIPANT_ROLE}'." >&2
  exit 1
fi

echo "Syncing participant users into Keycloak realm '${KEYCLOAK_REALM}'..."

kubectl_mappings_url="http://localhost:${JWTLET_LOCAL_PORT}/api/v1/mappings"

curl -sS -L "${kubectl_mappings_url}" -H "Authorization: Bearer ${ST}" \
  | jq -c '.[] | select(.clientIdentifier == "system:serviceaccount:edc-v:controlplane")' \
  | while IFS= read -r obj; do

  participant_id=$(echo "${obj}" | jq -r '.participantContext')
  if [[ -z "${participant_id}" || "${participant_id}" == "null" ]]; then
    echo "Skipping mapping with empty participant context." >&2
    continue
  fi

  token=$(curl -sS -X POST \
    -L "${JAD_BASE_URL}/api/auth/token" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
    --data-urlencode "subject_token=${ST}" \
    --data-urlencode 'subject_token_type=urn:ietf:params:oauth:token-type:jwt' \
    --data-urlencode "resource=${participant_id}" \
    --data-urlencode 'scope=read write' \
    --data-urlencode 'audience=edcv' \
    | jq -r '.access_token')

  if [[ -z "${token}" || "${token}" == "null" ]]; then
    echo "Failed to fetch participant token for ${participant_id}." >&2
    continue
  fi

  json_did=$(curl -sS -L "${JAD_BASE_URL}/api/identity/participants/${participant_id}/dids/query" \
    -H "Authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    -d '{}' | jq '.[0]')

  did=$(echo "${json_did}" | jq -r '.id // empty')
  connector_name=$(echo "${did}" | awk -F: '{print $NF}')
  dsp=$(echo "${json_did}" | jq -r '[.service[]? | select(.type == "ProtocolEndpoint") | .serviceEndpoint][0] // empty')

  if [[ -z "${did}" || -z "${connector_name}" || -z "${dsp}" ]]; then
    echo "Skipping ${participant_id}: missing DID or DSP endpoint." >&2
    continue
  fi

  connector_config=$(jq -c -n \
    --arg name "${connector_name}" \
    --arg mgmt "${JAD_BASE_URL}/api/management" \
    --arg mgmt_version "v5beta/participants/${participant_id}" \
    --arg default "${JAD_BASE_URL}/api/management/health" \
    --arg bearer "Bearer ${token}" \
    --arg did "${did}" \
    --arg dsp "${dsp}" \
    '{
      connectorName: $name,
      managementUrl: $mgmt,
      managementApiVersion: $mgmt_version,
      defaultUrl: $default,
      protocolUrl: $dsp,
      protocolVersion: "dataspace-protocol-http:2025-1",
      did: $did,
      authorization: {
        key: "Authorization",
        value: $bearer
      }
    }')

  username="${connector_name}"
  password="${connector_name}"
  participant_email="${connector_name}@participants.jad.local"

  existing_user=$(curl -sS \
    -G "${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users" \
    -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    --data-urlencode "username=${username}" \
    --data-urlencode "exact=true" \
    | jq '.[0]')

  user_id=$(echo "${existing_user}" | jq -r '.id // empty')

  user_payload=$(jq -n \
    --arg username "${username}" \
    --arg email "${participant_email}" \
    --arg participant_id "${participant_id}" \
    --arg connector_config "${connector_config}" \
    --arg password "${password}" \
    '{
      username: $username,
      enabled: true,
      emailVerified: true,
      email: $email,
      firstName: "Participant",
      lastName: $username,
      attributes: {
        participant_context_id: [$participant_id],
        edc_connector_config: [$connector_config]
      },
      credentials: [
        {
          type: "password",
          value: $password,
          temporary: false
        }
      ]
    }')

  attribute_payload=$(jq -n \
    --arg username "${username}" \
    --arg email "${participant_email}" \
    --arg participant_id "${participant_id}" \
    --arg connector_config "${connector_config}" \
    '{
      username: $username,
      enabled: true,
      emailVerified: true,
      email: $email,
      firstName: "Participant",
      lastName: $username,
      attributes: {
        participant_context_id: [$participant_id],
        edc_connector_config: [$connector_config]
      }
    }')

  if [[ -z "${user_id}" ]]; then
    create_response_headers=$(mktemp)
    create_status=$(curl -sS -o /dev/null -D "${create_response_headers}" -w '%{http_code}' \
      -X POST "${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users" \
      -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
      -H 'Content-Type: application/json' \
      --data "${user_payload}")

    if [[ "${create_status}" != "201" ]]; then
      rm -f "${create_response_headers}"
      echo "Failed to create user ${username} (status ${create_status})." >&2
      continue
    fi

    location=$(grep -i '^Location:' "${create_response_headers}" | awk '{print $2}' | tr -d '\r')
    rm -f "${create_response_headers}"
    user_id=${location##*/}
    echo "Created participant user '${username}' (${participant_id})."
  else
    update_status=$(curl -sS -o /dev/null -w '%{http_code}' \
      -X PUT "${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users/${user_id}" \
      -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
      -H 'Content-Type: application/json' \
      --data "${user_payload}")

    if [[ "${update_status}" != "204" ]]; then
      echo "Failed to update user ${username} (status ${update_status})." >&2
      continue
    fi
    echo "Updated participant user '${username}' (${participant_id}) with fresh connector claim."
  fi

  attributes_status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -X PUT "${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users/${user_id}" \
    -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data "${attribute_payload}")

  if [[ "${attributes_status}" != "204" ]]; then
    echo "Warning: failed to persist attributes for ${username} (status ${attributes_status})." >&2
    continue
  fi

  role_status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST "${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users/${user_id}/role-mappings/realm" \
    -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data "[$KC_ROLE]")

  if [[ "${role_status}" != "204" ]]; then
    echo "Warning: failed to assign role '${KEYCLOAK_PARTICIPANT_ROLE}' to ${username} (status ${role_status})." >&2
  fi

  verify_user=$(curl -sS \
    -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users/${user_id}")

  verified_participant_context=$(echo "${verify_user}" | jq -r '.attributes.participant_context_id[0] // empty')
  verified_connector_config=$(echo "${verify_user}" | jq -r '.attributes.edc_connector_config[0] // empty')

  if [[ -z "${verified_participant_context}" || -z "${verified_connector_config}" ]]; then
    echo "Warning: attributes missing after update for ${username}. Check realm user-profile unmanaged attributes policy." >&2
  fi
done

echo "Participant user sync complete."
