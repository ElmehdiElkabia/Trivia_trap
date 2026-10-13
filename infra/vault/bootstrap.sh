#!/bin/sh
set -eu

# Set variable with Vault API address
export VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"

# Persistent locations for the unseal key and application AppRole credentials.
BOOTSTRAP_DIR=/vault/bootstrap
BACKEND_APPROLE_DIR=/vault/backend-approle
POSTGRES_APPROLE_DIR=/vault/postgres-approle
MONITORING_APPROLE_DIR=/vault/monitoring-approle
UNSEAL_FILE="$BOOTSTRAP_DIR/unseal-key"
POLICY_FILE=/vault/policies/database-policy.hcl
BACKEND_POLICY_FILE=/vault/policies/backend-policy.hcl
MONITORING_POLICY_FILE=/vault/policies/monitoring-policy.hcl

# Create private directories for sensitive Vault credentials.
mkdir -p "$BOOTSTRAP_DIR" "$BACKEND_APPROLE_DIR" "$POSTGRES_APPROLE_DIR" "$MONITORING_APPROLE_DIR"
chmod 700 "$BOOTSTRAP_DIR" "$BACKEND_APPROLE_DIR" "$POSTGRES_APPROLE_DIR" "$MONITORING_APPROLE_DIR"

# Wait until the Vault API is reachable.
# Compose already waits for the Vault healthcheck. This loop also makes the
# script robust if an operator runs the bootstrap service directly.
i=0
until vault status >/dev/null 2>&1; do
  code=$?
  # Vault returns 2 while sealed or uninitialized; its API is still reachable.
  [ "$code" -eq 2 ] && break
  i=$((i + 1))
  [ "$i" -ge 30 ] && { echo "Vault API did not become reachable" >&2; exit 1; }
  sleep 1
done

# Detect whether Vault is being initialized for the first time.
NEW_INSTALL=0
if vault operator init -status >/dev/null 2>&1; then
  :
else
  code=$?
  if [ "$code" -eq 2 ]; then
    NEW_INSTALL=1
  else
    echo "Could not determine Vault initialization status" >&2
    exit 1
  fi
fi

# A new Vault must be initialized once to create its unseal key and root token.
if [ "$NEW_INSTALL" -eq 1 ]; then
  SMTP_PASSWORD_FILE=/run/bootstrap-secrets/smtp_password
  [ -s "$SMTP_PASSWORD_FILE" ] || {
    echo "Create secrets/smtp_password before the first Vault setup" >&2
    exit 1
  }

  echo "Initializing Vault..."
  umask 077
  vault operator init -key-shares=1 -key-threshold=1 -format=json > /tmp/vault-init.json

  UNSEAL_KEY="$(
    sed -n '/"unseal_keys_b64"[[:space:]]*:/,/]/ s/^[[:space:]]*"\([^"]*\)"[,[:space:]]*$/\1/p' /tmp/vault-init.json \
      | head -n 1
  )"
  ROOT_TOKEN="$(sed -n 's/.*"root_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' /tmp/vault-init.json | head -n 1)"

  [ -n "$UNSEAL_KEY" ] || { echo "Failed to read generated unseal key" >&2; exit 1; }
  [ -n "$ROOT_TOKEN" ] || { echo "Failed to read generated root token" >&2; exit 1; }

  # Keep the unseal key for future restarts; the temporary init output is removed.
  printf '%s\n' "$UNSEAL_KEY" > "$UNSEAL_FILE"
  chmod 600 "$UNSEAL_FILE"
  rm -f /tmp/vault-init.json
else
  # Existing Vault installations reuse their previously stored unseal key.
  [ -s "$UNSEAL_FILE" ] || {
    echo "Vault is initialized, but its local unseal key is missing." >&2
    echo "Restore vault_bootstrap or intentionally reset the Vault volumes." >&2
    exit 1
  }
  UNSEAL_KEY="$(cat "$UNSEAL_FILE")"
fi

# Unseal Vault when necessary so its encrypted storage becomes usable.
if vault status >/dev/null 2>&1; then
  :
else
  code=$?
  if [ "$code" -eq 2 ]; then
    echo "Unsealing Vault..."
    vault operator unseal "$UNSEAL_KEY" >/dev/null
  else
    echo "Vault status check failed" >&2
    exit 1
  fi
fi

# First-time configuration: secrets, policy and application identities.
if [ "$NEW_INSTALL" -eq 1 ]; then
  export VAULT_TOKEN="$ROOT_TOKEN"

  # On slower school machines, Raft may need a few seconds after unseal before
  # the single node becomes active. Wait for an authenticated admin request to
  # succeed instead of racing the first configuration command.
  echo "Waiting for Vault to become active..."
  i=0
  until vault secrets list >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -ge 30 ] && { echo "Vault did not become active in time" >&2; exit 1; }
    sleep 1
  done

  echo "Configuring Vault secret storage and application identities..."

  # Create the KV store used for application secrets.
  vault secrets enable -path=secret kv-v2 >/dev/null

  DB_PASSWORD="$(vault write -field=random_bytes sys/tools/random/24 format=hex)"


  # Store the database password in Vault, then remove it from shell variables.
  [ -n "$DB_PASSWORD" ] || { echo "Vault failed to obtain a database password" >&2; exit 1; }
  vault kv put secret/trivia/postgres password="$DB_PASSWORD" >/dev/null
  unset DB_PASSWORD

  # Generate the static JWT signing key once, during the first Vault setup.
  JWT_SECRET_KEY="$(vault write -field=random_bytes sys/tools/random/32 format=hex)"
  [ -n "$JWT_SECRET_KEY" ] || { echo "Vault failed to obtain a JWT signing key" >&2; exit 1; }
  SMTP_PASSWORD="$(cat "$SMTP_PASSWORD_FILE")"
  [ -n "$SMTP_PASSWORD" ] || { echo "SMTP password cannot be empty" >&2; exit 1; }

  vault kv put secret/trivia/backend-auth \
    jwt_secret_key="$JWT_SECRET_KEY" \
    smtp_password="$SMTP_PASSWORD" >/dev/null

  unset JWT_SECRET_KEY SMTP_PASSWORD SMTP_PASSWORD_FILE

  # Grafana gets its own generated admin credential. It is stored in Vault and
  # never hard-coded in compose.yaml or committed to the repository.
  GRAFANA_PASSWORD="$(vault write -field=random_bytes sys/tools/random/18 format=hex)"
  [ -n "$GRAFANA_PASSWORD" ] || { echo "Vault failed to obtain a Grafana password" >&2; exit 1; }
  vault kv put secret/trivia/grafana password="$GRAFANA_PASSWORD" >/dev/null
  unset GRAFANA_PASSWORD

  # Application and monitoring identities receive only the paths they need.
  vault policy write trivia-backend-read "$BACKEND_POLICY_FILE" >/dev/null
  vault policy write trivia-database-read "$POLICY_FILE" >/dev/null
  vault policy write trivia-monitoring-read "$MONITORING_POLICY_FILE" >/dev/null
  vault auth enable approle >/dev/null

  # Create a restricted machine identity and save its AppRole credentials.
  create_approle() {
    role_name="$1"
    target_dir="$2"
    policy_name="$3"

    vault write "auth/approle/role/$role_name" \
      token_policies="$policy_name" \
      token_no_default_policy=true \
      token_ttl="1h" \
      token_max_ttl="4h" \
      token_num_uses=0 \
      secret_id_num_uses=0 \
      secret_id_ttl=0 >/dev/null
    # Need to review these later (unlimited uses & never expires)

    vault read -field=role_id "auth/approle/role/$role_name/role-id" > "$target_dir/role-id"
    vault write -field=secret_id -f "auth/approle/role/$role_name/secret-id" > "$target_dir/secret-id"
    chmod 600 "$target_dir/role-id" "$target_dir/secret-id"
  }

  # Separate machine identities make backend and database access auditable and
  # prevent either container from receiving a reusable Vault root credential.
  create_approle trivia-backend "$BACKEND_APPROLE_DIR" trivia-backend-read
  create_approle trivia-postgres "$POSTGRES_APPROLE_DIR" trivia-database-read
  create_approle trivia-monitoring "$MONITORING_APPROLE_DIR" trivia-monitoring-read

  # Root is bootstrap-only. Policies and AppRoles are now sufficient for the
  # running services, so we do not leave a persistent root token behind.
  vault token revoke -self >/dev/null
  unset VAULT_TOKEN ROOT_TOKEN
else
  # On later starts, verify that the previously created AppRoles still exist.
  for dir in "$BACKEND_APPROLE_DIR" "$POSTGRES_APPROLE_DIR" "$MONITORING_APPROLE_DIR"; do
    [ -s "$dir/role-id" ] && [ -s "$dir/secret-id" ] || {
      echo "Vault AppRole credentials are missing from $dir." >&2
      echo "Restore the matching volume or intentionally reset Vault." >&2
      exit 1
    }
  done
fi

echo "Vault is unsealed and application identities are ready."
