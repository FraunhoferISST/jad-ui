#/bin/bash

# k8s access token for SA cfm-agents (has all necessary access roles)
ST=$(kubectl create token cfm-agents -n edc-v --audience="https://kubernetes.default.svc.cluster.local")

# Get all edc-v participant context IDs via jwtlet mappings and create edc-connector-config.json for them.
kubectl port-forward -n edc-v svc/jwtlet 8081:8081 &
PF_PID=$!
sleep 3

curl -s -L http://localhost:8081/api/v1/mappings -H "Authorization: Bearer $ST" \
  | jq -c '.[] | select(.clientIdentifier == "system:serviceaccount:edc-v:controlplane")' \
  | while IFS= read -r obj; do

  id=$(echo "$obj" | jq -r '.participantContext')

  # Get read+write token for participant from jwtlet
  token=$(curl -s -X POST \
    -L http://jad.localhost/api/auth/token \
    -H 'content-type: application/x-www-form-urlencoded' \
    -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange \
    -d subject_token=$ST \
    -d resource=$id \
    -d "scope=read write" \
    -d "audience=edcv" | jq -r '.access_token')

  mgmt="http://jad.localhost/api/management/v5beta/participants/$id"
  default="http://jad.localhost/api/management/health"

  # Get DID document of participant
  jsonDid=$(curl -s -L http://jad.localhost/api/identity/participants/$id/dids/query -H "Authorization: Bearer $token" -d '{}' -H "content-type: application/json" | jq '.[]')
  did=$(echo $jsonDid | jq -r '.id')
  name=$(echo $did | awk -F: '{print $NF}')
  dsp=$(echo $jsonDid | jq -r '.service[] | select(.type == "ProtocolEndpoint") | .serviceEndpoint')


  jq -n --arg name "$name" --arg mgmt "$mgmt" --arg default "$default" \
    --arg token "$token" --arg did "$did" --arg dsp "$dsp" \
    '{"connectorName": $name, "managementUrl": $mgmt, "defaultUrl": $default, "protocolUrl": $dsp, "apiToken": $token, "did": $did}'

done | jq -s '.' > ./public/config/edc-connector-config.json

kill $PF_PID
