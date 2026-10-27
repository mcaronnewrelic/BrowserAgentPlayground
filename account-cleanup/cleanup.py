#!/usr/bin/env python3
"""Deletes what one shared user (demo@newrelicuniversity.com by default) left behind in New Relic accounts.

Only items that user created are considered. An item is kept when its name contains "DO NOT DELETE"
(or "DONOTDELETE") or matches an entry in keep.txt. Everything else is listed, and deleted with --apply.
Without --apply nothing changes. See README.md.

    NEW_RELIC_API_KEY=NRAK-... python3 cleanup.py            # dry run: list what would be deleted
    NEW_RELIC_API_KEY=NRAK-... python3 cleanup.py --apply    # delete it

Python 3.8+, standard library only.
"""
import argparse
import fnmatch
import json
import os
import re
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DO_NOT_DELETE = re.compile(r"do\s*not\s*delete", re.I)
# Deletion order: workflows before the channels they use, channels before their destinations.
KINDS = ["workflows", "channels", "policies", "destinations", "dashboards", "service-levels", "workloads", "api-keys"]


def env_list(name, default):
    return [x.strip() for x in os.environ.get(name, default).split(",") if x.strip()]


# ---- NerdGraph ---------------------------------------------------------------------------------------

class NerdGraphError(Exception):
    pass


class NerdGraph:
    def __init__(self, key, url):
        self.key, self.url = key, url

    def call(self, query, variables=None, allow_errors=False):
        req = urllib.request.Request(self.url, data=json.dumps({"query": query, "variables": variables or {}}).encode(),
                                     headers={"Content-Type": "application/json", "API-Key": self.key})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = json.load(r)
        except urllib.error.HTTPError as e:
            raise NerdGraphError(f"HTTP {e.code}: {e.read()[:300]!r}")
        if body.get("errors") and not allow_errors:
            raise NerdGraphError("; ".join(e.get("message", "?") for e in body["errors"]))
        return body

    def data(self, query, variables=None):
        return self.call(query, variables)["data"]

    def paged(self, query, variables, path):
        """Follows nextCursor; `path` leads from data to the object holding nextCursor and the list."""
        items, cursor = [], None
        while True:
            node = self.data(query, dict(variables, cursor=cursor))
            for p in path[:-1]:
                node = node[p] or {}
            items += node.get(path[-1]) or []
            cursor = node.get("nextCursor")
            if not cursor:
                return items

    def entities(self, search, fields=""):
        return self.paged(
            "query($q: String!, $cursor: String) { actor { entitySearch(query: $q) { results(cursor: $cursor) {"
            " nextCursor entities { guid name accountId tags { key values } %s } } } } }" % fields,
            {"q": search}, ["actor", "entitySearch", "results", "entities"])


# ---- Keep list ---------------------------------------------------------------------------------------

class KeepList:
    """Names (with * and ? wildcards, case-insensitive) or exact IDs/GUIDs, one per line; # starts a comment."""

    def __init__(self, path):
        self.path, self.entries = path, []
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.split("#", 1)[0].strip()
                    if line:
                        self.entries.append(line)

    def reason(self, name, *ids):
        name = (name or "").strip()
        if DO_NOT_DELETE.search(name):
            return "name says do not delete"
        for e in self.entries:
            if fnmatch.fnmatch(name.lower(), e.lower()) or e in ids:
                return f"keep list: {e}"
        return None


# ---- Collecting what the owner created -------------------------------------------------------------------

class Item:
    def __init__(self, kind, account, ident, name, keep=None, note=""):
        self.kind, self.account, self.id, self.name, self.keep, self.note = kind, account, ident, name, keep, note
        self.result = None


class Cleanup:
    def __init__(self, ng, owner, accounts, key_accounts, keep, kinds):
        self.ng, self.owner, self.accounts, self.key_accounts = ng, owner.lower(), accounts, key_accounts
        self.keep, self.kinds = keep, kinds
        self.items, self.review, self.emails = [], [], {}

    def is_owner(self, email):
        return (email or "").lower() == self.owner

    def add(self, kind, account, ident, name, *ids, note=""):
        item = Item(kind, account, ident, name, self.keep.reason(name, ident, *ids), note)
        self.items.append(item)
        return item

    def user_emails(self, ids):
        missing = sorted({i for i in ids if i and i not in self.emails})
        for i in range(0, len(missing), 50):
            d = self.ng.data("query($ids: [ID!]) { actor { users { userSearch(query: {scope: {userIds: $ids}}) {"
                             " users { userId email } } } } }", {"ids": [str(x) for x in missing[i:i + 50]]})
            for u in d["actor"]["users"]["userSearch"]["users"] or []:
                self.emails[int(u["userId"])] = u["email"]
        return self.emails

    def collect(self):
        for account in self.accounts:
            if {"workflows", "channels", "destinations"} & set(self.kinds):
                self.collect_notifications(account)
            if "policies" in self.kinds:
                self.collect_policies(account)
            if "dashboards" in self.kinds:
                self.collect_dashboards(account)
            if "service-levels" in self.kinds:
                self.collect_service_levels(account)
            if "workloads" in self.kinds:
                self.collect_workloads(account)
        if "api-keys" in self.kinds:
            self.collect_api_keys()

    def collect_notifications(self, account):
        n = "query($a: Int!, $cursor: String) { actor { account(id: $a) { aiNotifications { %s(cursor: $cursor) { nextCursor entities { %s } } } } } }"
        dests = self.ng.paged(n % ("destinations", "id name type updatedBy"), {"a": account},
                              ["actor", "account", "aiNotifications", "destinations", "entities"])
        chans = self.ng.paged(n % ("channels", "id name destinationId updatedBy"), {"a": account},
                              ["actor", "account", "aiNotifications", "channels", "entities"])
        flows = self.ng.paged("query($a: Int!, $cursor: String) { actor { account(id: $a) { aiWorkflows { workflows(cursor: $cursor) {"
                              " nextCursor entities { id name destinationConfigurations { channelId } } } } } } }",
                              {"a": account}, ["actor", "account", "aiWorkflows", "workflows", "entities"])
        emails = self.user_emails([x.get("updatedBy") for x in dests + chans])
        chan_owner = {c["id"]: emails.get(c.get("updatedBy")) for c in chans}

        # A workflow records no creator, so it counts as the owner's when every channel it sends to is theirs.
        staying_channels = set()
        for w in flows:
            ids = [c["channelId"] for c in w.get("destinationConfigurations") or [] if c.get("channelId")]
            if ids and all(self.is_owner(chan_owner.get(i)) for i in ids) and "workflows" in self.kinds:
                item = self.add("workflows", account, w["id"], w["name"], note=f"{len(ids)} channel(s)")
                if not item.keep:
                    continue
            staying_channels.update(ids)

        # A channel or destination still used by something that stays is kept, whoever made it.
        staying_dests = set()
        for c in chans:
            if self.is_owner(chan_owner[c["id"]]) and "channels" in self.kinds:
                item = self.add("channels", account, c["id"], c["name"])
                if c["id"] in staying_channels and not item.keep:
                    item.keep = "used by a workflow that stays"
                if not item.keep:
                    continue
            staying_dests.add(c["destinationId"])
        for d in dests:
            if self.is_owner(emails.get(d.get("updatedBy"))) and "destinations" in self.kinds:
                item = self.add("destinations", account, d["id"], d["name"], note=d["type"])
                if d["id"] in staying_dests and not item.keep:
                    item.keep = "used by a channel that stays"

    def collect_policies(self, account):
        policies = self.ng.paged("query($a: Int!, $cursor: String) { actor { account(id: $a) { alerts { policiesSearch(cursor: $cursor) {"
                                 " nextCursor policies { id name } } } } } }",
                                 {"a": account}, ["actor", "account", "alerts", "policiesSearch", "policies"])
        conds = self.ng.paged("query($a: Int!, $cursor: String) { actor { account(id: $a) { alerts { nrqlConditionsSearch(cursor: $cursor) {"
                              " nextCursor nrqlConditions { id policyId createdBy { email } } } } } } }",
                              {"a": account}, ["actor", "account", "alerts", "nrqlConditionsSearch", "nrqlConditions"])
        by_policy = {}
        for c in conds:
            by_policy.setdefault(c["policyId"], []).append((c.get("createdBy") or {}).get("email"))
        # A policy records no creator, so it counts as the owner's when all its conditions are theirs.
        # Without NRQL conditions there is no way to tell (and it may hold older non-NRQL conditions).
        for p in policies:
            creators = by_policy.get(p["id"], [])
            if not creators:
                self.review.append(f"Alert policy **{p['name']}** ({account}): no NRQL conditions, so its owner is unknown")
            elif all(self.is_owner(e) for e in creators):
                self.add("policies", account, p["id"], p["name"], note=f"{len(creators)} condition(s)")

    def collect_dashboards(self, account):
        for d in self.ng.entities(f"type = 'DASHBOARD' AND accountId = {account}",
                                  "... on DashboardEntityOutline { owner { email } dashboardParentGuid }"):
            # Each page of a dashboard is its own entity; deleting the dashboard removes its pages.
            if not d.get("dashboardParentGuid") and self.is_owner((d.get("owner") or {}).get("email")):
                self.add("dashboards", account, d["guid"], d["name"])

    def collect_service_levels(self, account):
        guids = [e["guid"] for e in self.ng.entities(f"type = 'SERVICE_LEVEL' AND accountId = {account}")]
        for i in range(0, len(guids), 25):
            d = self.ng.data("query($g: [EntityGuid]!) { actor { entities(guids: $g) { guid name"
                             " serviceLevel { indicators { createdBy { email } } } } } }", {"g": guids[i:i + 25]})
            for e in d["actor"]["entities"]:
                indicators = (e.get("serviceLevel") or {}).get("indicators") or []
                if indicators and all(self.is_owner((x.get("createdBy") or {}).get("email")) for x in indicators):
                    self.add("service-levels", account, e["guid"], e["name"])

    def collect_workloads(self, account):
        for w in self.ng.entities(f"type = 'WORKLOAD' AND accountId = {account}"):
            created_by = next((t["values"][0] for t in w["tags"] if t["key"] == "createdBy" and t["values"]), None)
            if self.is_owner(created_by):
                self.add("workloads", account, w["guid"], w["name"])

    def collect_api_keys(self):
        scope = {} if self.key_accounts == ["all"] else {"accountIds": [int(a) for a in self.key_accounts]}
        keys = self.ng.paged("query($scope: ApiAccessKeySearchScope, $cursor: String) { actor { apiAccess {"
                             " keySearch(cursor: $cursor, query: {types: [USER], scope: $scope}) { nextCursor"
                             " keys { id name obfuscatedKey ... on ApiAccessUserKey { accountId user { email } } } } } } }",
                             {"scope": scope}, ["actor", "apiAccess", "keySearch", "keys"])
        in_use = self.ng.key[:8]
        for k in keys:
            if self.is_owner((k.get("user") or {}).get("email")):
                item = self.add("api-keys", k.get("accountId"), k["id"], k["name"], k["obfuscatedKey"], note=k["obfuscatedKey"])
                if k["obfuscatedKey"].startswith(in_use):
                    item.keep = "the key this run uses"

    # ---- Deleting --------------------------------------------------------------------------------------

    def delete(self, item):
        a, i = item.account, item.id
        ng = self.ng
        if item.kind == "workflows":
            # Channels are handled on their own, so a channel another workflow uses is never removed with this one.
            r = ng.data("mutation($a: Int!, $id: ID!) { aiWorkflowsDeleteWorkflow(accountId: $a, id: $id, deleteChannels: false) {"
                        " id errors { description type } } }", {"a": a, "id": i})["aiWorkflowsDeleteWorkflow"]
            return None if r.get("id") and not r.get("errors") else json.dumps(r.get("errors"))
        if item.kind in ("channels", "destinations"):
            name, arg = ("aiNotificationsDeleteChannel", "channelId") if item.kind == "channels" else ("aiNotificationsDeleteDestination", "destinationId")
            r = ng.data("mutation($a: Int!, $id: ID!) { %s(accountId: $a, %s: $id) { ids error { description type } } }" % (name, arg),
                        {"a": a, "id": i})[name]
            return None if i in (r.get("ids") or []) else json.dumps(r.get("error"))
        if item.kind == "policies":
            r = ng.data("mutation($a: Int!, $id: ID!) { alertsPolicyDelete(accountId: $a, id: $id) { id } }", {"a": a, "id": i})
            return None if (r["alertsPolicyDelete"] or {}).get("id") else "not deleted"
        if item.kind == "dashboards":
            r = ng.data("mutation($g: EntityGuid!) { dashboardDelete(guid: $g) { status errors { description type } } }", {"g": i})["dashboardDelete"]
            return None if r.get("status") == "SUCCESS" else json.dumps(r.get("errors") or r.get("status"))
        if item.kind == "service-levels":
            r = ng.data("mutation($g: EntityGuid!) { serviceLevelDelete(guid: $g) { id } }", {"g": i})
            return None if (r["serviceLevelDelete"] or {}).get("id") else "not deleted"
        if item.kind == "workloads":
            r = ng.data("mutation($g: EntityGuid!) { workloadDelete(guid: $g) { guid } }", {"g": i})
            return None if (r["workloadDelete"] or {}).get("guid") else "not deleted"
        if item.kind == "api-keys":
            r = ng.data("mutation($ids: [String!]) { apiAccessDeleteKeys(keys: {userKeyIds: $ids}) { deletedKeys { id } errors { message } } }",
                        {"ids": [i]})["apiAccessDeleteKeys"]
            return None if any(k["id"] == i for k in r.get("deletedKeys") or []) else json.dumps(r.get("errors"))
        return f"unknown kind {item.kind}"

    def apply(self):
        for kind in KINDS:
            for item in self.items:
                if item.kind != kind or item.keep:
                    continue
                try:
                    err = self.delete(item)
                except NerdGraphError as e:
                    err = str(e)
                item.result = "deleted" if err is None else f"FAILED: {err}"
                print(f"  {item.result:8.200}  {kind}: {item.name}", flush=True)


# ---- Reporting -------------------------------------------------------------------------------------------

def report(c, applied):
    lines = [f"## Account cleanup ({'applied' if applied else 'dry run'})", "",
             f"Owner: `{c.owner}` · accounts: {', '.join(map(str, c.accounts))} · API key accounts: {', '.join(c.key_accounts)}", ""]
    for kind in KINDS:
        items = [i for i in c.items if i.kind == kind]
        if kind not in c.kinds:
            continue
        gone = [i for i in items if not i.keep]
        lines += [f"### {kind}: {len(gone)} to delete, {len(items) - len(gone)} kept", ""]
        if items:
            lines += ["| Name | Account | Action | Note |", "| --- | --- | --- | --- |"]
            for i in sorted(items, key=lambda i: (bool(i.keep), str(i.account), (i.name or "").lower())):
                action = f"keep ({i.keep})" if i.keep else (i.result or "delete")
                name = (i.name or "(no name)").replace("|", "\\|")
                lines.append(f"| {name} | {i.account} | {action} | {i.note} |")
            lines.append("")
    if c.review:
        lines += ["### Needs a look", ""] + [f"- {r}" for r in c.review] + [""]
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--apply", action="store_true", default=os.environ.get("CLEANUP_APPLY", "").lower() == "true",
                   help="delete (default: only list what would be deleted)")
    p.add_argument("--owner", default=os.environ.get("CLEANUP_OWNER") or "demo@newrelicuniversity.com")
    p.add_argument("--accounts", default=",".join(env_list("CLEANUP_ACCOUNTS", "6932347")),
                   help="comma-separated account IDs to clean (default 6932347)")
    p.add_argument("--key-accounts", default=",".join(env_list("CLEANUP_KEY_ACCOUNTS", "all")),
                   help="accounts whose API keys to clean, or 'all' for every account the key can see")
    p.add_argument("--only", default=os.environ.get("CLEANUP_ONLY", ""), help="comma-separated kinds: " + ", ".join(KINDS))
    p.add_argument("--keep-file", default=os.environ.get("CLEANUP_KEEP_FILE") or os.path.join(HERE, "keep.txt"))
    args = p.parse_args()

    key = os.environ.get("NEW_RELIC_API_KEY")
    if not key:
        sys.exit("Set NEW_RELIC_API_KEY to a New Relic User key (NRAK-...).")
    kinds = [k.strip() for k in args.only.split(",") if k.strip()] or KINDS
    unknown = set(kinds) - set(KINDS)
    if unknown:
        sys.exit(f"Unknown kind(s): {', '.join(sorted(unknown))}. Choose from: {', '.join(KINDS)}")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    ng = NerdGraph(key, os.environ.get("NERDGRAPH_URL") or "https://api.newrelic.com/graphql")
    me = ng.data("{ actor { user { email } } }")["actor"]["user"]["email"]
    keep = KeepList(args.keep_file)
    c = Cleanup(ng, args.owner, [int(a) for a in args.accounts.split(",") if a.strip()],
                [a.strip() for a in args.key_accounts.split(",") if a.strip()], keep, kinds)
    print(f"Running as {me}; cleaning up after {c.owner}; keep list {keep.path} ({len(keep.entries)} entries)")
    c.collect()
    if args.apply:
        print("Deleting:")
        c.apply()
    text = report(c, args.apply)
    print("\n" + text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text + "\n")
    failed = [i for i in c.items if i.result and i.result.startswith("FAILED")]
    if failed:
        print(f"\n{len(failed)} deletion(s) failed.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
