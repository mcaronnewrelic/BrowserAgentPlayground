#!/usr/bin/env python3
"""Encode or decode New Relic Hurl state URLs.

Default (encode): build a dashboard deep link with template variables pre-set.
--decode URL: inspect any ?state=uuid URL — prints the stored state JSON.

The NR Hurl service stores nerdlet state server-side and returns a short
?state=uuid URL. Any NR1 URL containing ?state= can be decoded.

Requirements:
  - Encode: New Relic user API key (NRAK-...) — set NR_API_KEY or pass --api-key
  - Decode: API key OR NR session cookie (--cookie / NR_COOKIE) from browser DevTools
  - For encode: dashboard entity GUID and variable names (case-sensitive)

ENCODE example:
  export NR_API_KEY=NRAK-...
  python3 nr-dashboard-link.py \\
    --env eu \\
    --account 7673270 \\
    --guid NzY3MzI3MHxWSVp8REFTSEJPQVJEfGRhOjI3NDA2NjM \\
    --var "Customer=Koerber Pharma Software GmbH" \\
    --var Site=customer \\
    --var System=customer-lsr \\
    --var Environment=lsr \\
    --filter "tags.env = production"

  → https://one.eu.newrelic.com/dashboards/detail/...?account=7673270&duration=1800000&state=<uuid>

DECODE example:
  # bare UUID (--env required)
  python3 nr-dashboard-link.py --decode 2dc11e97-6110-3201-7095-d0d3a8d5a778 --env eu --api-key $KEY

  # full URL (--env optional, detected from hostname)
  python3 nr-dashboard-link.py --decode "https://one.eu.newrelic.com/...?state=2dc11e97-..." --api-key $KEY

  → prints the stored state JSON (nerdlet IDs, urlState, selectedVariables)

Get the GUID from the dashboard URL:
  https://one.eu.newrelic.com/dashboards/detail/<GUID>
  or: https://one.eu.newrelic.com/redirect/entity/<GUID>

Get variable names from the dashboard's variable settings panel (Edit → Variables).
The name field (not the display title) is what --var expects.

Common durations (--duration):
  1800000  = 30 min (default)
  3600000  = 1 hr
  86400000 = 24 hr
"""

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

ENVS = {
    "us": {
        "hurl": "https://hurl.service.newrelic.com/url",
        "base": "https://one.newrelic.com",
    },
    "eu": {
        "hurl": "https://hurl.service.eu.newrelic.com/url",
        "base": "https://one.eu.newrelic.com",
    },
}


def detect_env(url):
    return "eu" if "eu" in urllib.parse.urlparse(url).netloc else "us"


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-key", default=None,
                        help="New Relic user API key (or set NR_API_KEY)")
    parser.add_argument("--cookie", default=None,
                        help="NR session cookie string (alternative to --api-key for decode; grab from browser DevTools)")
    parser.add_argument("--decode", metavar="STATE_OR_URL",
                        help="Decode a state UUID (or a ?state=uuid URL) and print the stored state JSON")
    parser.add_argument("--env", choices=["us", "eu"])
    parser.add_argument("--account", type=int)
    parser.add_argument("--guid", help="Dashboard entity GUID")
    parser.add_argument("--var", metavar="NAME=VALUE", action="append", default=[],
                        help="Template variable (repeatable)")
    parser.add_argument("--filter", metavar="FILTER_STRING", default=None,
                        help="Entity filter bar value, e.g. --filter 'tags.env = production'")
    parser.add_argument("--duration", type=int, default=1800000, metavar="MS",
                        help="Relative time window in ms (default: 1800000 = 30 min)")
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("NR_API_KEY")
    cookie = args.cookie or os.environ.get("NR_COOKIE")

    if args.decode and not api_key and not cookie:
        sys.exit("Provide --api-key, --cookie, NR_API_KEY, or NR_COOKIE")
    if not args.decode and not api_key:
        sys.exit("Provide --api-key or set NR_API_KEY")

    if args.decode:
        val = args.decode
        if val.startswith("http"):
            params = urllib.parse.parse_qs(urllib.parse.urlparse(val).query)
            if "state" not in params:
                sys.exit("No ?state= param found in URL")
            uuid = params["state"][0]
            env_key = args.env or detect_env(val)
        else:
            uuid = val
            if not args.env:
                sys.exit("--env required when passing a bare state UUID")
            env_key = args.env
        env = ENVS[env_key]
        if api_key:
            headers = {"API-Key": api_key}
        else:
            headers = {"Cookie": cookie}
        req = urllib.request.Request(
            f"{env['hurl']}?state={uuid}",
            headers=headers,
            method="GET",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                data = resp.read().decode()
        except urllib.error.HTTPError as e:
            sys.exit(f"HTTP {e.code}: {e.read().decode()}")
        try:
            print(json.dumps(json.loads(data), indent=2))
        except json.JSONDecodeError:
            print(data)
        return

    # encode
    for flag, val in [("--env", args.env), ("--account", args.account), ("--guid", args.guid)]:
        if not val:
            sys.exit(f"{flag} is required for encode")

    variables = {}
    for pair in args.var:
        if "=" not in pair:
            sys.exit(f"Invalid --var '{pair}': expected NAME=VALUE")
        name, value = pair.split("=", 1)
        variables[name] = [value]

    body = {
        "launcher": {"id": "dashboards.launcher", "urlState": {}},
        "main": {
            "id": "dashboards.detail",
            "urlState": {
                "entityGuid": args.guid,
                "selectedVariables": variables,
                **( {"filter": args.filter} if args.filter else {} ),
            },
        },
        "platformState": {
            "accountId": args.account,
            "timeRange": {"duration": args.duration},
        },
    }

    env = ENVS[args.env]
    req = urllib.request.Request(
        env["hurl"],
        data=json.dumps(body).encode(),
        headers={"API-Key": api_key, "Content-Type": "application/json"},
        method="PUT",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            path = resp.read().decode().strip()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()}")

    print(f"{env['base']}{path}")


if __name__ == "__main__":
    main()
