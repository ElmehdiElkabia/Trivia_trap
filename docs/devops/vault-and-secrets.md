# Vault and secrets

HashiCorp Vault keeps runtime credentials out of committed files and Docker container metadata.

## Stored secrets

| Vault path | Contents | Consumers |
| --- | --- | --- |
| `secret/trivia/postgres` | Generated database password | PostgreSQL, backend, backup, PostgreSQL exporter |
| `secret/trivia/backend-auth` | Generated JWT key and imported SMTP password | Backend |
| `secret/trivia/grafana` | Generated administrator password | Grafana |

## Startup flow

1. `vault-bootstrap` initializes and unseals a new Vault.
2. It generates the database, JWT, and Grafana credentials.
3. It imports SMTP from the ignored `secrets/smtp_password` file.
4. It creates restricted AppRoles for the backend, database/backup, and monitoring services.
5. Vault Agent authenticates each service and injects only the secrets allowed by its policy.

The Makefile checks for the SMTP file only when no saved Vault initialization state exists. The same validation remains inside `infra/vault/bootstrap.sh` for direct Compose usage.

## Least privilege

- The backend may read its authentication secrets and the database credential.
- PostgreSQL and backup may read only the database credential.
- Monitoring may read the database and Grafana credentials.
- Application identities cannot administer Vault or write arbitrary secrets.

## Persistent state

- `vault_data`: encrypted Vault storage.
- `vault_bootstrap`: saved unseal key.
- `vault_*_approle`: service AppRole credentials.

`make re` keeps these volumes, so Vault is not initialized again. `make down-v` removes them and requires a new `secrets/smtp_password` on the next startup.

## Useful checks

```bash
docker compose ps vault vault-bootstrap
docker compose logs vault-bootstrap
sh infra/tests/test-vault2.sh
```

Never commit `.env`, `secrets/smtp_password`, unseal keys, tokens, or AppRole credentials.
