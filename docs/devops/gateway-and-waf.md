# Gateway and WAF

Nginx is the only public entry point. It terminates HTTPS, proxies application traffic, supports WebSockets, rate-limits the API, and applies ModSecurity with the OWASP Core Rule Set.

## Public routes

| Route | Destination |
| --- | --- |
| `/` | Next.js frontend |
| `/api/` | FastAPI backend |
| `/ws/room/` | Game WebSocket, rewritten internally to `/room/` |
| `/invitations/ws` | Invitation WebSocket |
| `/uploads/` | Backend-uploaded media |
| `/grafana/` | Authenticated Grafana |
| `/status` | Human-readable service status |
| `/backup-status` | Latest backup status JSON |

HTTP port `8080` redirects to HTTPS port `8443`. Certificates are generated locally and persisted in the `nginx_certs` volume.

## Security controls

- ModSecurity runs in blocking mode with OWASP CRS paranoia level 2.
- API traffic is limited to 5 requests per second per IP, with a burst of 10.
- Only Nginx publishes host ports.
- Grafana anonymous access and account signup are disabled.
- The upload body limit is 5 MB.

PromQL and Grafana legend templates can resemble attacks to generic WAF rules. `grafana-waf-exclusions.conf` therefore excludes only the observed query fields on the required Grafana datasource endpoints. Authentication and WAF checks remain enabled elsewhere.

## Verification

```bash
docker compose exec nginx nginx -t
sh infra/tests/test-rate-limit.sh
sh infra/tests/test-monitoring-fixed.sh
```

Avoid broad WAF exclusions. New exceptions should be limited to a required route, field, and rule ID.
