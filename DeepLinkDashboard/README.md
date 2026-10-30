# nr-dashboard-link

Generate New Relic dashboard deep links with template variables, filters, and time range pre-set. Also decode any existing `?state=uuid` URL to inspect its stored state.

Uses the NR [Hurl service](https://hurl.service.newrelic.com) — the same mechanism the NR1 platform uses for its own "Copy link" feature. No dependencies, stdlib only.

## Requirements

- Python 3.6+
- A New Relic user API key (`NRAK-...`) for the account that owns the dashboard

## Usage

### Encode — build a deep link

```bash
export NR_API_KEY=NRAK-...

python3 nr-dashboard-link.py \
  --env eu \
  --account 7673270 \
  --guid NzY3MzI3MHxWSVp8REFTSEJPQVJEfGRhOjI3NDA2NjM \
  --var "Customer=Acme Corp" \
  --var Site=production \
  --var Environment=prod
```

Output:
```
https://one.eu.newrelic.com/dashboards/detail/NzY3...?account=7673270&duration=1800000&state=2dc11e97-...
```

### Decode — inspect a state URL

```bash
# bare UUID (--env required)
python3 nr-dashboard-link.py --decode 2dc11e97-6110-3201-7095-d0d3a8d5a778 --env eu

# full URL (--env auto-detected from hostname)
python3 nr-dashboard-link.py --decode "https://one.eu.newrelic.com/dashboards/detail/...?state=2dc11e97-..."
```

Output:
```json
{
  "main": {
    "urlState": {
      "selectedVariables": {
        "Customer": ["Acme Corp"],
        "Site": ["production"],
        "Environment": ["prod"]
      }
    }
  }
}
```

## Options

| Flag | Description |
|---|---|
| `--env` | `us` or `eu` |
| `--account` | Account ID that owns the dashboard |
| `--guid` | Dashboard entity GUID (from the dashboard URL) |
| `--var NAME=VALUE` | Template variable (repeatable) |
| `--filter STRING` | Entity filter bar value, e.g. `tags.env = production` |
| `--duration MS` | Relative time window in ms (default: `1800000` = 30 min) |
| `--decode STATE_OR_URL` | Decode a state UUID or full `?state=uuid` URL |
| `--api-key` | User API key — or set `NR_API_KEY` |
| `--cookie` | NR session cookie — alternative to API key for decode |

## Getting the dashboard GUID

From the dashboard URL:
```
https://one.eu.newrelic.com/dashboards/detail/<GUID>
```

## Getting variable names

Variable **names** (not display titles) come from the dashboard's variable settings panel: **Edit → Variables**. Names are case-sensitive.

## Common durations

| `--duration` | Window |
|---|---|
| `1800000` | 30 min (default) |
| `3600000` | 1 hr |
| `86400000` | 24 hr |
| `604800000` | 7 days |
