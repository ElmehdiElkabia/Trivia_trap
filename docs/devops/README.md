# DevOps documentation

This folder documents the infrastructure work for Trivia Trap: Docker Compose orchestration, HTTPS and WAF protection, Vault secret delivery, PostgreSQL backups, and Prometheus/Grafana monitoring.

## Architecture

```text
Browser -> Nginx HTTPS + ModSecurity -> Frontend / Backend / Grafana
                                      -> status and backup status

Vault -> service-specific AppRoles -> PostgreSQL / Backend / Backup / Monitoring

Prometheus -> PostgreSQL, Nginx and Blackbox exporters -> Grafana dashboards
```

Only Nginx publishes host ports: HTTP `8080` and HTTPS `8443`. Application, database, Vault, Grafana, Prometheus, and exporter traffic stays on the Compose network.

## Documents

- [Vault and secrets](vault-and-secrets.md)
- [Monitoring and alerting](monitoring.md)
- [Gateway and WAF](gateway-and-waf.md)
- [Backup and restore](backup-and-restore.md)

## First startup

```bash
cp .env.example .env
nano secrets/smtp_password
chmod 600 secrets/smtp_password
make
```

Open `https://localhost:8443`. The local certificate is self-signed, so the browser may display a warning.

The SMTP file is needed only when Vault is initialized for the first time. It is ignored by Git and may be deleted after Vault stores the value. A full volume reset requires creating it again.

## Common commands

```bash
make                 # Build and start
make re              # Recreate containers while keeping volumes
make down            # Stop containers and keep volumes
make down-v          # Delete containers and all persistent volumes
docker compose ps    # Check service state
```

`make down-v` deletes PostgreSQL data, backups, uploads, Grafana data, Prometheus data, and Vault state. Use it only for an intentional clean reset.

## Verification

```bash
sh infra/tests/test-vault2.sh
sh infra/tests/test-monitoring-fixed.sh
sh infra/tests/test-minor.sh
sh infra/tests/test-rate-limit.sh
```

The live alert test is optional because it temporarily stops the frontend:

```bash
sh infra/tests/test-monitoring-fixed.sh --alert-test
```
