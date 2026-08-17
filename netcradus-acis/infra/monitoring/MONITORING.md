# Production Monitoring

## What's here

- **Prometheus** (`prometheus`, internal only) — scrapes every Spring Boot
  microservice's real `/actuator/prometheus` (request rate/errors/latency,
  JVM heap, HikariCP pool — added via `micrometer-registry-prometheus` in
  each service's pom.xml + `management.metrics.export.prometheus` in each
  `application.yml`), `ai-service`'s `/metrics` (via
  `prometheus-fastapi-instrumentator`), `cadvisor` (container CPU/mem),
  `postgres-exporter` (DB connections/query stats), and `es-exporter`
  (Elasticsearch cluster health). 30-day retention on the `prometheus_data`
  volume. Rules in `alert-rules.yml` are loaded and evaluated continuously.
- **Alertmanager** (`alertmanager`, internal only) — receives firing alerts
  from Prometheus, groups/dedupes them, and would forward to a real
  notification channel once you configure one (see `alertmanager.yml`'s own
  header comment — it ships with NO receiver configured, deliberately,
  rather than a fake webhook URL).
- **Grafana** (`grafana`, exposed at `https://<PUBLIC_APP_DOMAIN>:8444`) —
  Prometheus datasource and the "ACIS Production Overview" dashboard are
  both provisioned automatically on first boot (`provisioning/`,
  `dashboards/acis-overview.json`) — you land on a working dashboard, not an
  empty instance. Log in with `GRAFANA_ADMIN_USER`/`GRAFANA_ADMIN_PASSWORD`
  from `.env`.

## Why Prometheus/Alertmanager aren't published like Grafana

Neither has its own login. Reach them via an SSH tunnel to the Docker host
instead of exposing them publicly:

```bash
ssh -L 9090:localhost:9090 -L 9093:localhost:9093 <user>@<prod-host>
# then browse http://localhost:9090 (Prometheus) / http://localhost:9093 (Alertmanager) locally
```

## What the dashboard/alerts actually cover

- **App**: request rate, 5xx error rate, p99 latency, JVM heap — per service.
- **Infra**: how many scrape targets are `up`, container memory/CPU usage.
- **DB**: `pg_up`, HikariCP connection pool usage per service.
- **Business health**: gateway 401/403 rate (auth-failure proxy), ingestion
  service 5xx rate (ingestion-failure proxy). These are real, currently-
  emitted HTTP-status-based proxies — a dedicated "critical alerts created"
  or "records ingested/failed" business counter doesn't exist as a
  Prometheus series yet (that's row data in Postgres, not an instrumented
  metric). Adding one is a small, real follow-up (a Micrometer `Counter` in
  the relevant service) rather than something faked here.

## Alert rules (`alert-rules.yml`) — verified with real `promtool check`

11 rules across 5 groups: `ServiceDown`, `HighServerErrorRate`,
`HighRequestLatencyP99`, `JvmHeapNearLimit`, `PostgresDown`,
`HikariPoolNearExhaustion`, `HikariPoolPendingConnections`,
`ContainerHighMemoryUsage`, `ContainerRestartingRepeatedly`,
`AuthFailureSpike`, `IngestionErrorRateHigh`. Each has a `for:` duration
before firing (2-10 minutes depending on how noisy a brief blip would be)
specifically so a single slow request or one restart on deploy doesn't page
anyone — see each rule's own `description` annotation for what it means and
what to check first.

`PostgresDown` inhibits the derivative `HikariPool*`/`ServiceDown` alerts
in `alertmanager.yml` so a full outage produces one alert, not a storm.
