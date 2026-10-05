#!/usr/bin/env bash
set -euo pipefail

SEED_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SEED_DIR}/../.." && pwd)"
NAMESPACE="$(awk '$1 == "namespace:" { print $2; exit }' "${SEED_DIR}/kustomization.yaml")"
if [[ -z "$NAMESPACE" ]]; then
  echo "ERROR: kustomization.yaml must specify a namespace" >&2
  exit 1
fi

# Render before deleting the previous Job, so local configuration errors do not
# disrupt it. The public schema stays the single source of truth; no copied JSON.
MANIFEST="$(mktemp)"
trap 'rm -f "$MANIFEST"' EXIT
kubectl kustomize "$SEED_DIR" > "$MANIFEST"

kubectl -n "$NAMESPACE" delete job jad-profile-seed --ignore-not-found --wait=true
kubectl -n "$NAMESPACE" create configmap jad-profile-schema \
  --from-file="jad-profile.json=${REPO_ROOT}/public/config/jad-profile.json" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "$MANIFEST"

printf '\nSeed Job submitted. Follow progress with:\n'
printf 'kubectl -n %s logs -f job/jad-profile-seed\n' "$NAMESPACE"
printf 'kubectl -n %s wait --for=condition=complete job/jad-profile-seed --timeout=900s\n' "$NAMESPACE"
