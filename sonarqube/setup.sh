#!/usr/bin/env bash
# SonarQube Community Edition — setup script for agent-smith
# Usage: bash sonarqube/setup.sh

set -e

SONAR_URL="${SONAR_HOST_URL:-http://localhost:9002}"
PROJECT_KEY="agent-smith"
PROJECT_NAME="Agent Smith"

echo "=== SonarQube Setup for ${PROJECT_NAME} ==="
echo ""

# 1. Start SonarQube if not running
if ! docker ps --format '{{.Names}}' | grep -q "agent-smith-sonarqube"; then
  echo "Starting SonarQube Community Edition..."
  docker compose -f sonarqube/docker-compose.yml up -d
  echo "Waiting for SonarQube to be ready..."
  echo "  (this may take 60-90 seconds on first run)"
fi

# Wait for SonarQube to be healthy
echo "Waiting for SonarQube health check..."
for i in $(seq 1 30); do
  if curl -sf "${SONAR_URL}/api/system/health" > /dev/null 2>&1; then
    echo "SonarQube is UP (${SONAR_URL})"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "ERROR: SonarQube did not start within 90 seconds"
    echo "Check: docker logs agent-smith-sonarqube"
    exit 1
  fi
  sleep 3
done

# 2. Check if token is set
if [ -z "${SONAR_TOKEN}" ]; then
  echo ""
  echo "============================================"
  echo "  SonarQube is running at: ${SONAR_URL}"
  echo "  Login: admin / admin"
  echo "============================================"
  echo ""
  echo "Generate a token at: ${SONAR_URL}/account/security"
  echo ""
  echo "Then run:"
  echo "  export SONAR_TOKEN=<your-token>"
  echo "  export SONAR_HOST_URL=${SONAR_URL}"
  echo "  npm run sonarqube"
  echo ""
  echo "Or for CI, add token as GitHub secret:"
  echo "  gh secret set SONAR_TOKEN --body '<your-token>' --repo gunesbizim/agent-smith"
  exit 0
fi

# 3. Create project in SonarQube
echo ""
echo "Creating project: ${PROJECT_KEY}"

curl -sS -u "${SONAR_TOKEN}:" \
  -X POST "${SONAR_URL}/api/projects/create" \
  -d "name=${PROJECT_NAME}" \
  -d "project=${PROJECT_KEY}" \
  -d "visibility=public" > /dev/null 2>&1 || echo "  (project may already exist)"

# 4. Set quality gate
echo "Setting quality gate to 'Sonar way'..."
QG=$(curl -sS -u "${SONAR_TOKEN}:" "${SONAR_URL}/api/qualitygates/list" | python3 -c "import sys,json; gates=json.load(sys.stdin)['qualitygates']; print([g['id'] for g in gates if g['name']=='Sonar way'][0])" 2>/dev/null || echo "")
if [ -n "${QG}" ]; then
  curl -sS -u "${SONAR_TOKEN}:" \
    -X POST "${SONAR_URL}/api/qualitygates/select" \
    -d "projectKey=${PROJECT_KEY}" \
    -d "gateId=${QG}" > /dev/null 2>&1
fi

# 5. Set TypeScript quality profile
echo "Configuring TypeScript quality profile..."
PROFILE=$(curl -sS -u "${SONAR_TOKEN}:" "${SONAR_URL}/api/qualityprofiles/search?qualityProfile=Sonar+way&language=ts" | python3 -c "import sys,json; profiles=json.load(sys.stdin)['profiles']; print(profiles[0]['key'] if profiles else '')" 2>/dev/null || echo "")
if [ -n "${PROFILE}" ]; then
  curl -sS -u "${SONAR_TOKEN}:" \
    -X POST "${SONAR_URL}/api/qualityprofiles/add_project" \
    -d "project=${PROJECT_KEY}" \
    -d "qualityProfile=${PROFILE}" > /dev/null 2>&1
fi

# 6. Generate project token
echo "Generating project analysis token..."
TOKEN_NAME="${PROJECT_KEY}-analysis-token"
# Delete existing token if any
curl -sS -u "${SONAR_TOKEN}:" "${SONAR_URL}/api/user_tokens/search" | python3 -c "
import sys,json
tokens=json.load(sys.stdin).get('userTokens',[])
for t in tokens:
  if t['name'] == '${TOKEN_NAME}':
    print(t['name'])
" 2>/dev/null | while read -r tname; do
  [ -n "$tname" ] && curl -sS -u "${SONAR_TOKEN}:" -X POST "${SONAR_URL}/api/user_tokens/revoke" -d "name=${tname}" > /dev/null 2>&1
done

RESPONSE=$(curl -sS -u "${SONAR_TOKEN}:" \
  -X POST "${SONAR_URL}/api/user_tokens/generate" \
  -d "name=${TOKEN_NAME}" \
  -d "type=PROJECT_ANALYSIS_TOKEN" \
  -d "projectKey=${PROJECT_KEY}")
ANALYSIS_TOKEN=$(echo "${RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

echo ""
echo "============================================"
echo "  SonarQube ready!"
echo "  Project: ${SONAR_URL}/dashboard?id=${PROJECT_KEY}"
echo "============================================"
echo ""

if [ -n "${ANALYSIS_TOKEN}" ]; then
  echo "Run locally:"
  echo "  SONAR_TOKEN=${ANALYSIS_TOKEN} SONAR_HOST_URL=${SONAR_URL} npm run sonarqube"
  echo ""
  echo "Or add to CI as GitHub secret:"
  echo "  gh secret set SONAR_TOKEN --body '${ANALYSIS_TOKEN}' --repo gunesbizim/agent-smith"
fi
