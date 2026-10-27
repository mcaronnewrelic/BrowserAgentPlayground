# Noisy neighbor (bonus exercise)

A "noisy neighbor" is a process that hogs a shared host and starves everything else running on it. This exercise puts one on the demo host on purpose, so students can practise the diagnosis: start from a slow or alerting application, follow the New Relic entity relationships down **application → container → host**, and find the process burning the host's CPU.

The busy process is a copy of [stress-ng](https://github.com/ColinIanKing/stress-ng) named `noisy-neighbor`. The name is self-labelled, not a disguise: students still have to follow the dependency chain to find *which* host and container it lands on, which is the real skill, rather than grepping every host for "stress-ng".

> **Status: being built.** The host load and the metrics it moves are still being tuned. The student-facing steps and the in-site hints aren't written yet.

## What's here

| File | What it does |
| --- | --- |
| `setup.sh` | Installs stress-ng, copies it to `/usr/local/bin/noisy-neighbor`, and installs a daily cron job |
| `run.sh` | Runs one bounded burst of load. The cron job runs this, and you can run it by hand to test. |
| `teardown.sh` | Removes the cron job and the binary |

## Requirements

- The host is the EC2 box running `compose.yaml`, with the New Relic infrastructure agent (the `newrelic-infra` service).
- **Process metrics must be on.** `compose.yaml` sets `NRIA_ENABLE_PROCESS_METRICS: "true"`; without it the agent never reports `ProcessSample`, so the busy process is invisible and the exercise doesn't work. After changing that, redeploy the agent (`docker compose up -d newrelic-infra`) and confirm:

  ```sql
  SELECT count(*) FROM ProcessSample WHERE entityName = 'browser.nru.to' SINCE 10 minutes ago
  ```

## Set it up on the host

From this folder on the EC2 host:

```bash
sudo bash setup.sh
```

That installs everything and prints where it put the binary, the cron file and the log. Then test a burst straight away, without waiting for cron:

```bash
sudo bash run.sh
```

Watch the host in New Relic for a few minutes (see the queries below). Tune the intensity in `/etc/cron.d/noisy-neighbor` or by passing environment variables, then remove it all with `sudo bash teardown.sh` when you're done.

## Intensity

The defaults are deliberately aggressive, to make the impact obvious on a small instance: `run.sh` runs one stress-ng CPU worker per core, plus a memory worker and an I/O worker, for `DURATION` seconds (default 300), with a hard timeout so it always stops. While it runs, it also drives a steady, light stream of requests at the app so the APM response-time chart reliably shows the slowdown even with no visitors. Override any of these as environment variables, in the cron file, or on a manual run:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DURATION` | `300` | Seconds of load |
| `CPU_WORKERS` | `0` | CPU hogs; `0` means one per core |
| `VM_WORKERS` | `1` | Memory hogs |
| `VM_BYTES` | `256M` | Memory per memory hog |
| `IO_WORKERS` | `1` | Disk I/O hogs |
| `API_URL` | `http://127.0.0.1:3000/api/products` | App endpoint the load generator hits |
| `API_CLIENTS` | `2` | Steady requests in flight against `API_URL`; `0` turns it off |
| `CRON_TIME` | `0 15` | `setup.sh` only: daily run time, "minute hour" in UTC |

To keep the host responsive while testing by hand, drop the stressors below the core count and skip the app load, e.g. `CPU_WORKERS=1 VM_WORKERS=0 IO_WORKERS=0 DURATION=60 sudo bash run.sh`. Stop a runaway burst any time with `sudo bash stop.sh`.

## Queries for checking the impact

```sql
-- Host CPU and load, minute by minute
SELECT average(cpuPercent), average(loadAverageOneMinute) FROM SystemSample WHERE entityName = 'browser.nru.to' TIMESERIES SINCE 1 hour ago

-- The busy process, once process metrics are on
SELECT average(cpuPercent) FROM ProcessSample WHERE entityName = 'browser.nru.to' FACET commandName SINCE 1 hour ago

-- Whether the app's API felt it (the CPU-bound recommendations endpoint shows it most clearly)
SELECT average(duration)*1000 AS 'ms' FROM Transaction WHERE entityGuid = 'NjkzMjM0N3xBUE18QVBQTElDQVRJT058MTExNzgyNTc1Ng' AND name = 'WebTransaction/Custom/api/recommendations' TIMESERIES SINCE 1 hour ago

-- Whether the synthetic checks slowed or failed
SELECT average(duration), filter(count(*), WHERE result = 'FAILED') AS 'failures' FROM SyntheticCheck WHERE monitorName LIKE 'Agent Playground - %' TIMESERIES SINCE 1 hour ago
```
