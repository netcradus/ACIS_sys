#!/usr/bin/env bash
# Applies Phase 1c realm changes that either can't be expressed in a plain
# realm-acis.json import (the User Profile "unmanaged attributes" policy is
# a separate Keycloak sub-resource, not part of RealmRepresentation) or are
# safe to run idempotently against an already-imported dev realm.
#
# Everything else from this phase (the "company-admin" role, the "roles"
# client scope's client-role mapper, editUsernameAllowed, and the
# service-account-acis-backend client-role grants) IS captured in
# realm-acis.json directly and only needs this script for a realm that was
# already running before this phase (a fresh --import-realm picks those up
# automatically).
#
# Usage: KEYCLOAK_URL=http://localhost:8180 KEYCLOAK_ADMIN_USER=admin \
#        KEYCLOAK_ADMIN_PASSWORD=admin ./apply-phase1c-realm-changes.sh
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
KEYCLOAK_ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
REALM="acis"

TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=admin-cli&username=$KEYCLOAK_ADMIN_USER&password=$KEYCLOAK_ADMIN_PASSWORD" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

echo "== Enabling unmanaged user attributes (required for tenant_id to survive API-driven user create/update — Keycloak 24's User Profile feature silently drops attributes not in its declared schema otherwise) =="
curl -sf -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/profile" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "attributes": [
        {"name":"username","displayName":"${username}","validations":{"length":{"min":3,"max":255},"username-prohibited-characters":{},"up-username-not-idn-homograph":{}},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},
        {"name":"email","displayName":"${email}","validations":{"email":{},"length":{"max":255}},"required":{"roles":["user"]},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},
        {"name":"firstName","displayName":"${firstName}","validations":{"length":{"max":255},"person-name-prohibited-characters":{}},"required":{"roles":["user"]},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},
        {"name":"lastName","displayName":"${lastName}","validations":{"length":{"max":255},"person-name-prohibited-characters":{}},"required":{"roles":["user"]},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false}
    ],
    "groups": [{"name":"user-metadata","displayHeader":"User metadata","displayDescription":"Attributes, which refer to user metadata"}],
    "unmanagedAttributePolicy": "ENABLED"
  }' > /dev/null

echo "== Granting acis-backend's service account 'view-realm' (needed to read realm role definitions via Admin REST, e.g. GET /roles/{name}) =="
REALM_MGMT_ID=$(curl -sf -H "Authorization: Bearer $TOKEN" "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=realm-management" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
BACKEND_CLIENT_ID=$(curl -sf -H "Authorization: Bearer $TOKEN" "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=acis-backend" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
SVC_USER_ID=$(curl -sf -H "Authorization: Bearer $TOKEN" "$KEYCLOAK_URL/admin/realms/$REALM/clients/$BACKEND_CLIENT_ID/service-account-user" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
VIEW_REALM_ROLE=$(curl -sf -H "Authorization: Bearer $TOKEN" "$KEYCLOAK_URL/admin/realms/$REALM/clients/$REALM_MGMT_ID/roles/view-realm")
curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users/$SVC_USER_ID/role-mappings/clients/$REALM_MGMT_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "[$VIEW_REALM_ROLE]" > /dev/null || true

echo "Done. Restart acis-platform-admin so its cached Keycloak admin-client token picks up the new grant (403s persist until the ~5min token naturally expires otherwise)."
