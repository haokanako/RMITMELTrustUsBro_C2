#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - << 'PY'
import json, urllib.error, urllib.parse, urllib.request

BASE = "http://localhost:8080"
REALM = "cloakdine"
CLIENT = "cloakdine"
REDIRECT = "http://localhost:5174/*"
ORIGIN = "http://localhost:5174"
# Taken off the CloakDine client so the login token cannot carry a name, email, or phone.
DROP_SCOPES = {"profile", "email", "phone"}
FORBIDDEN = {"name", "given_name", "family_name", "preferred_username", "email", "phone_number", "phone", "phone_number_verified"}
PHONE_ATTRIBUTE = {
    "name": "phoneNumber",
    "displayName": "Phone number",
    "validations": {
        "length": {"min": 8, "max": 16},
        "pattern": {
            "pattern": "^\\+[1-9][0-9]{7,14}$",
            "error-message": "Enter a phone number like +60123456789.",
        },
    },
    "required": {"roles": ["user"]},
    "permissions": {"view": ["admin", "user"], "edit": ["admin", "user"]},
    "multivalued": False,
}

def request(method, url, token=None, body=None, ok=(200, 201, 204)):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        if error.code in ok:
            return error.code, json.loads(raw) if raw else None
        detail = raw.decode()[:500]
        raise SystemExit(f"{method} {url} failed: {error.code} {detail}")

def form(url, fields):
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req) as response:
        return json.load(response)

try:
    urllib.request.urlopen(BASE, timeout=5).status
except Exception as error:
    raise SystemExit(f"TideCloak is not answering at {BASE}. Start the container first. {error}")

token = form(f"{BASE}/realms/master/protocol/openid-connect/token", {
    "grant_type": "password",
    "client_id": "admin-cli",
    "username": "admin",
    "password": "password",
})["access_token"]

status, _ = request("POST", f"{BASE}/admin/realms", token, {
    "realm": REALM,
    "enabled": True,
    "displayName": "CloakDine",
}, ok=(201, 409))
_, realm = request("GET", f"{BASE}/admin/realms/{REALM}", token)
realm["registrationAllowed"] = True
realm["verifyEmail"] = False
realm["registrationEmailAsUsername"] = False
request("PUT", f"{BASE}/admin/realms/{REALM}", token, realm)
print("registrationAllowed true")

_, clients = request("GET", f"{BASE}/admin/realms/{REALM}/clients?clientId={CLIENT}", token)
if clients:
    client_id = clients[0]["id"]
else:
    request("POST", f"{BASE}/admin/realms/{REALM}/clients", token, {
        "clientId": CLIENT,
        "name": "CloakDine",
        "enabled": True,
        "protocol": "openid-connect",
        "publicClient": True,
        "standardFlowEnabled": True,
        "directAccessGrantsEnabled": True,
        "redirectUris": [REDIRECT],
        "webOrigins": [ORIGIN],
        "rootUrl": ORIGIN,
        "baseUrl": ORIGIN,
        "attributes": {"pkce.code.challenge.method": "S256"},
    }, ok=(201,))
    _, clients = request("GET", f"{BASE}/admin/realms/{REALM}/clients?clientId={CLIENT}", token)
    client_id = clients[0]["id"]
print(f"client {client_id}")

_, scopes = request("GET", f"{BASE}/admin/realms/{REALM}/client-scopes", token)
scope_ids = {item["name"]: item["id"] for item in scopes}
for name in DROP_SCOPES:
    scope_id = scope_ids[name]
    for kind in ("default-client-scopes", "optional-client-scopes"):
        request("DELETE", f"{BASE}/admin/realms/{REALM}/clients/{client_id}/{kind}/{scope_id}", token, ok=(204, 404))
print("removed profile, email, and phone scopes")
for kind in ("default-client-scopes", "optional-client-scopes"):
    _, attached = request("GET", f"{BASE}/admin/realms/{REALM}/clients/{client_id}/{kind}", token)
    left = sorted(item["name"] for item in attached if item["name"] in DROP_SCOPES)
    if left:
        raise SystemExit(f"{kind} still has {', '.join(left)}")

_, profile = request("GET", f"{BASE}/admin/realms/{REALM}/users/profile", token)
attributes = profile.get("attributes") or []
current = next((item for item in attributes if item.get("name") == "phoneNumber"), None)
if current is None:
    attributes.append(PHONE_ATTRIBUTE)
else:
    scopes = (current.get("required") or {}).get("scopes") or []
    if "phone" in scopes:
        current["required"] = {"roles": ["user"]}
profile["attributes"] = attributes
request("PUT", f"{BASE}/admin/realms/{REALM}/users/profile", token, profile)

user = {
    "username": "mira",
    "enabled": True,
    "email": "mira@example.edu",
    "emailVerified": True,
    "firstName": "Mira",
    "lastName": "Tan",
    "attributes": {"phoneNumber": ["+60123456789"]},
}
status, _ = request("POST", f"{BASE}/admin/realms/{REALM}/users", token, user, ok=(201, 409))
_, users = request("GET", f"{BASE}/admin/realms/{REALM}/users?username=mira", token)
user_id = users[0]["id"]
if status == 409:
    request("PUT", f"{BASE}/admin/realms/{REALM}/users/{user_id}", token, {**user, "id": user_id})
request("PUT", f"{BASE}/admin/realms/{REALM}/users/{user_id}/reset-password", token, {
    "type": "password",
    "value": "password",
    "temporary": False,
})
_, stored = request("GET", f"{BASE}/admin/realms/{REALM}/users/{user_id}", token)
phone = (stored.get("attributes") or {}).get("phoneNumber")
if phone != ["+60123456789"]:
    raise SystemExit("phoneNumber was not stored on mira")
print("phoneNumber ok")
print("user mira")

_, adapter = request("GET", f"{BASE}/admin/realms/{REALM}/clients/{client_id}/installation/providers/keycloak-oidc-keycloak-json", token)
with open("public/tidecloak.json", "w") as handle:
    json.dump(adapter, handle, indent=2)
    handle.write("\n")

issued = form(f"{BASE}/realms/{REALM}/protocol/openid-connect/token", {
    "grant_type": "password",
    "client_id": CLIENT,
    "username": "mira",
    "password": "password",
})
payload = issued["access_token"].split(".")[1]
payload += "=" * (-len(payload) % 4)
claims = json.loads(__import__("base64").urlsafe_b64decode(payload))
found = sorted(FORBIDDEN.intersection(claims))
if "sub" not in claims:
    raise SystemExit("Token has no sub.")
if found:
    raise SystemExit("Token carries forbidden claims: " + ", ".join(found))
print("token identity claim:", claims["sub"])
print("CloakDine is ready. Log in as mira / password at http://localhost:5174")
PY
