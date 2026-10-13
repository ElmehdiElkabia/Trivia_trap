# Monitoring and alerting

Prometheus collects infrastructure and availability metrics every 15 seconds. Grafana displays them through two provisioned dashboards.

## Metrics sources

| Job | Purpose |
| --- | --- |
| `prometheus` | Prometheus self-monitoring |
| `postgres` | Database health, connections, transactions, cache, size, and activity |
| `nginx` | Requests and connection states from internal `stub_status` |
| `blackbox-exporter` | Exporter availability |
| `web` | Backend liveness/readiness and frontend HTTP probes |
| `gateway` | Public HTTPS status-page probe |

Prometheus, Grafana, and exporter ports are internal. Grafana is reached only through `https://localhost:8443/grafana/` and requires login.

Retrieve the generated Grafana password with:

```bash
docker compose exec grafana \
  cat /run/monitoring-secrets/grafana_admin_password
```

The username is `admin`.

## Dashboards

- **Trivia Trap Overview:** service status, endpoint latency, Nginx traffic/connections, scrape health, and active alerts.
- **Trivia Trap - PostgreSQL:** connections, size, cache-hit ratio, transactions, rollbacks, row activity, block reads, temporary writes, and deadlocks.

## Alert rules

- `WebEndpointDown`: a web or gateway probe fails for one minute.
- `PostgreSQLDown`: PostgreSQL reports down for one minute.
- `MonitoringExporterDown`: PostgreSQL, Blackbox, or Nginx exporter is down for one minute.

Firing alerts appear in the Grafana overview dashboard. Alertmanager is not configured, so these rules do not send email or chat notifications.

## Verification

```bash
sh infra/tests/test-monitoring-fixed.sh
```

To prove that an alert reaches the firing state:

```bash
sh infra/tests/test-monitoring-fixed.sh --alert-test
```

That test temporarily stops the frontend, waits for `WebEndpointDown`, and restores the frontend automatically.
