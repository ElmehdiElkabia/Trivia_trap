#!/bin/sh
set -eu

# Prometheus + Grafana acceptance test for Trivia_trap.
# Run from the repository root after: docker compose up --build -d
# Optional: sh infra/tests/test-monitoring-fixed.sh --alert-test

cd "$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"

ALERT_TEST=0
[ "${1:-}" = "--alert-test" ] && ALERT_TEST=1

PASS=0
FAIL=0

ok() {
  echo "PASS: $*"
  PASS=$((PASS + 1))
}

bad() {
  echo "FAIL: $*"
  FAIL=$((FAIL + 1))
}

section() {
  echo
  echo "=== $* ==="
}

container_id() {
  docker compose ps -a -q "$1" 2>/dev/null || true
}

running() {
  id="$(container_id "$1")"
  [ -n "$id" ] || return 1
  [ "$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null)" = "running" ]
}

healthy() {
  id="$(container_id "$1")"
  [ -n "$id" ] || return 1
  [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null)" = "healthy" ]
}

exited_zero() {
  id="$(container_id "$1")"
  [ -n "$id" ] || return 1
  [ "$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null)" = "exited" ] && \
  [ "$(docker inspect -f '{{.State.ExitCode}}' "$id" 2>/dev/null)" = "0" ]
}

backend_http_ok() {
  url="$1"
  docker compose exec -T backend python - "$url" <<'PY' >/dev/null 2>&1
import sys, urllib.request
url = sys.argv[1]
with urllib.request.urlopen(url, timeout=5) as r:
    if r.status < 200 or r.status >= 300:
        raise SystemExit(1)
    r.read()
PY
}

prom_query_one() {
  query="$1"
  docker compose exec -T backend python - "$query" <<'PY' >/dev/null 2>&1
import json, sys, urllib.parse, urllib.request
q = sys.argv[1]
url = "http://prometheus:9090/api/v1/query?" + urllib.parse.urlencode({"query": q})
with urllib.request.urlopen(url, timeout=5) as r:
    data = json.load(r)
if data.get("status") != "success":
    raise SystemExit(1)
result = data.get("data", {}).get("result", [])
if not result:
    raise SystemExit(1)
value = float(result[0]["value"][1])
if value != 1.0:
    raise SystemExit(1)
PY
}

prom_alert_is_firing() {
  docker compose exec -T backend python - <<'PY' >/dev/null 2>&1
import json, urllib.parse, urllib.request
q = 'ALERTS{alertname="WebEndpointDown",alertstate="firing"}'
url = "http://prometheus:9090/api/v1/query?" + urllib.parse.urlencode({"query": q})
with urllib.request.urlopen(url, timeout=5) as r:
    data = json.load(r)
result = data.get("data", {}).get("result", [])
raise SystemExit(0 if result else 1)
PY
}

check_rules() {
  docker compose exec -T backend python - <<'PY' >/dev/null 2>&1
import json, urllib.request
wanted = {"WebEndpointDown", "PostgreSQLDown", "MonitoringExporterDown"}
with urllib.request.urlopen("http://prometheus:9090/api/v1/rules", timeout=5) as r:
    data = json.load(r)
found = set()
for group in data.get("data", {}).get("groups", []):
    for rule in group.get("rules", []):
        if rule.get("type") == "alerting":
            found.add(rule.get("name"))
raise SystemExit(0 if wanted.issubset(found) else 1)
PY
}

check_grafana_provisioning() {
  password="$(docker compose exec -T grafana cat /run/monitoring-secrets/grafana_admin_password 2>/dev/null | tr -d '\r\n')"
  [ -n "$password" ] || return 1

  docker compose exec -T -e GRAFANA_TEST_PASSWORD="$password" backend python - <<'PY' >/dev/null 2>&1
import base64, json, os, ssl, time, urllib.parse, urllib.request
password = os.environ["GRAFANA_TEST_PASSWORD"]
header = "Basic " + base64.b64encode(("admin:" + password).encode()).decode()

def get(path, payload=None):
    req = urllib.request.Request("https://nginx:8443/grafana" + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": header, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10, context=ssl._create_unverified_context()) as r:
        return json.load(r)

ds = get("/api/datasources/uid/prometheus")
if ds.get("type") != "prometheus":
    raise SystemExit(1)

for uid, title in {
    "trivia-trap-overview": "Trivia Trap Overview",
    "trivia-postgres": "Trivia Trap - PostgreSQL",
}.items():
    dash = get("/api/dashboards/uid/" + uid)
    if dash.get("dashboard", {}).get("title") != title:
        raise SystemExit(1)
    if uid == "trivia-trap-overview":
        active_alerts = next(
            panel for panel in dash["dashboard"]["panels"]
            if panel.get("title") == "Active alerts"
        )
        assert active_alerts.get("type") == "table"
        assert active_alerts["targets"][0]["expr"] == 'ALERTS{alertstate="firing"}'
    for panel in dash["dashboard"]["panels"]:
        queries = []
        for target in panel.get("targets", []):
            expr = target["expr"].replace("$__rate_interval", "1m").replace("$__range", "1h").replace("$database", ".*")
            queries.append({**target, "expr": expr,
                "datasource": {"type": "prometheus", "uid": "prometheus"},
                "intervalMs": 15000, "maxDataPoints": 300})
        if not queries:
            continue
        now = int(time.time() * 1000)
        result = get("/api/ds/query", {"queries": queries, "from": str(now - 3600000), "to": str(now)})
        for query in queries:
            data = result.get("results", {}).get(query["refId"], {})
            assert not data.get("error") and data.get("status", 200) == 200, panel["title"]
            if panel["title"] == "Active alerts":
                # No frames is the correct result when no alerts are firing.
                continue
            # Idle ratios can legitimately return null, but missing series fail.
            assert any(frame.get("data", {}).get("values", [[]])[0]
                       for frame in data.get("frames", [])), panel["title"]

selector = 'pg_stat_database_numbackends{job="postgres",datname!~"template0|template1",datname!=""}'
path = "/api/datasources/uid/prometheus/resources/api/v1/label/datname/values?"
assert get(path + urllib.parse.urlencode({"match[]": selector})).get("data")
PY
}

check_grafana_waf_scope() {
  docker compose exec -T backend python - <<'PY' >/dev/null 2>&1
import json, ssl, urllib.error, urllib.request

# Query exceptions must not bypass login, other fields, or other routes.
cases = [
    ("/grafana/api/ds/query", {"queries": []}, 401),
    ("/grafana/api/ds/query", {"unexpected": "<script>alert(1)</script>"}, 403),
    ("/api/__waf_monitoring_test__", {"queries": [{"expr": 'sum(rate(nginx_http_requests_total{job="nginx"}[1m]))'}]}, 403),
]
for path, payload, expected in cases:
    req = urllib.request.Request("https://nginx:8443" + path,
        data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=5, context=ssl._create_unverified_context())
    except urllib.error.HTTPError as error:
        assert error.code == expected, (path, error.code)
    else:
        raise AssertionError((path, "Expected rejection", expected))
PY
}

check_grafana_requires_auth() {
  docker compose exec -T backend python - <<'PY' >/dev/null 2>&1
import urllib.error, urllib.request
try:
    urllib.request.urlopen("http://grafana:3000/api/user", timeout=5)
except urllib.error.HTTPError as e:
    raise SystemExit(0 if e.code == 401 else 1)
except Exception:
    raise SystemExit(1)
raise SystemExit(1)
PY
}

not_published() {
  service="$1"
  id="$(container_id "$service")"
  [ -n "$id" ] || return 1
  # HostConfig.PortBindings is null when the container port is internal-only.
  value="$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$id" 2>/dev/null || true)"
  case "$value" in
    ''|'null'|'{}') return 0 ;;
    *) return 1 ;;
  esac
}

printf '%s\n' "========================================"
printf '%s\n' " PROMETHEUS + GRAFANA ACCEPTANCE TEST"
printf '%s\n' "========================================"

section "1. Required local configuration"
if [ -f .env ] &&
   grep -Eq '^POSTGRES_USER=.+$' .env &&
   grep -Eq '^POSTGRES_DB=.+$' .env; then
  ok ".env contains POSTGRES_USER and POSTGRES_DB"
else
  bad ".env is missing POSTGRES_USER or POSTGRES_DB"
  echo "      Create it from .env.example before testing."
fi

section "2. Core service health"
for service in vault postgres backup backend frontend nginx; do
  if healthy "$service"; then ok "$service is healthy"; else bad "$service is not healthy"; fi
done

section "3. One-shot setup services"
if exited_zero vault-bootstrap; then ok "vault-bootstrap completed successfully"; else bad "vault-bootstrap did not exit 0"; fi
if exited_zero monitoring-secrets; then ok "monitoring-secrets completed successfully"; else bad "monitoring-secrets did not exit 0"; fi

section "4. Monitoring containers"
for service in prometheus blackbox-exporter postgres-exporter nginx-exporter grafana; do
  if running "$service"; then ok "$service is running"; else bad "$service is not running"; fi
done

section "5. Internal monitoring endpoints"
if backend_http_ok "http://prometheus:9090/-/ready"; then ok "Prometheus is ready"; else bad "Prometheus is not ready"; fi
if backend_http_ok "http://blackbox-exporter:9115/metrics"; then ok "Blackbox Exporter exposes metrics"; else bad "Blackbox Exporter metrics unavailable"; fi
if backend_http_ok "http://postgres-exporter:9187/metrics"; then ok "PostgreSQL Exporter exposes metrics"; else bad "PostgreSQL Exporter metrics unavailable"; fi
if backend_http_ok "http://grafana:3000/api/health"; then ok "Grafana API is healthy"; else bad "Grafana API is unhealthy"; fi

section "6. Prometheus collected metrics"
if prom_query_one 'up{job="nginx"}'; then ok "Prometheus scrapes the Nginx exporter"; else bad "Nginx exporter scrape failed"; fi
if prom_query_one 'nginx_up{job="nginx"}'; then ok "Nginx stub_status scrape succeeds"; else bad "nginx_up is missing or not 1"; fi
if prom_query_one 'pg_up{job="postgres"}'; then ok "Prometheus reports PostgreSQL UP"; else bad "pg_up is missing or not 1"; fi
if prom_query_one 'probe_success{job="web",instance="http://backend:8000/health"}'; then ok "Backend liveness probe succeeds"; else bad "Backend liveness probe failed"; fi
if prom_query_one 'probe_success{job="web",instance="http://backend:8000/ready"}'; then ok "Backend readiness probe succeeds"; else bad "Backend readiness probe failed"; fi
if prom_query_one 'probe_success{job="web",instance="http://frontend:3000/"}'; then ok "Frontend probe succeeds"; else bad "Frontend probe failed"; fi
if prom_query_one 'probe_success{job="gateway",instance="https://nginx:8443/status"}'; then ok "Nginx HTTPS probe succeeds"; else bad "Nginx HTTPS probe failed"; fi

section "7. Alert rules"
if check_rules; then ok "All three Prometheus alert rules are loaded"; else bad "One or more alert rules are missing"; fi

section "8. Grafana provisioning and access control"
if check_grafana_provisioning; then ok "Both dashboards and database filter return data through HTTPS/WAF"; else bad "Grafana provisioning/query check failed (allow one minute of scrapes)"; fi
if check_grafana_requires_auth; then ok "Grafana API requires authentication"; else bad "Grafana authentication check failed"; fi
if check_grafana_waf_scope; then ok "Grafana query exceptions preserve login and WAF checks elsewhere"; else bad "Grafana WAF exception scope failed"; fi

section "9. Host exposure"
if not_published prometheus 9090; then ok "Prometheus is not published directly"; else bad "Prometheus has a host port"; fi
if not_published grafana 3000; then ok "Grafana is not published directly"; else bad "Grafana has a host port"; fi
if not_published blackbox-exporter 9115; then ok "Blackbox Exporter is not published directly"; else bad "Blackbox Exporter has a host port"; fi
if not_published postgres-exporter 9187; then ok "PostgreSQL Exporter is not published directly"; else bad "PostgreSQL Exporter has a host port"; fi

if not_published nginx-exporter; then ok "Nginx Exporter is not published directly"; else bad "Nginx Exporter has a host port"; fi

section "10. Grafana through HTTPS gateway"
code="$(curl -k -s -o /dev/null -w '%{http_code}' https://localhost:8443/grafana/ || true)"
case "$code" in
  200|302) ok "Grafana is reachable through Nginx HTTPS (HTTP $code)" ;;
  *) bad "Grafana HTTPS gateway returned HTTP ${code:-none}" ;;
esac

if [ "$ALERT_TEST" -eq 1 ]; then
  section "11. Live alert firing test"
  echo "Stopping frontend to trigger WebEndpointDown..."
  docker compose stop frontend >/dev/null

  restore_frontend() {
    docker compose start frontend >/dev/null 2>&1 || true
  }
  trap restore_frontend EXIT INT TERM

  fired=0
  i=0
  while [ "$i" -lt 12 ]; do
    if prom_alert_is_firing; then
      fired=1
      break
    fi
    i=$((i + 1))
    sleep 10
  done

  if [ "$fired" -eq 1 ]; then
    ok "WebEndpointDown became FIRING"
  else
    bad "WebEndpointDown did not fire within 120 seconds"
  fi

  echo "Starting frontend again..."
  restore_frontend
  trap - EXIT INT TERM
else
  section "11. Live alert firing test"
  echo "SKIP: run 'sh infra/tests/test-monitoring-fixed.sh --alert-test' to stop the frontend temporarily and verify a firing alert."
fi

section "Final Compose status"
docker compose ps -a

echo
printf '%s\n' "========================================"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
printf '%s\n' "========================================"

if [ "$FAIL" -eq 0 ]; then
  echo "ALL MONITORING TESTS PASSED"
  exit 0
fi

echo "MONITORING ACCEPTANCE TEST FAILED"
exit 1
