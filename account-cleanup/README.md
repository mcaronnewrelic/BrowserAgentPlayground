# Account cleanup

Learners share one New Relic login, `demo@newrelicuniversity.com`, in the enablement accounts. Over time it leaves behind dashboards, workloads, alert policies, notification destinations and API keys. `cleanup.py` finds what that user created and deletes it, except what you've chosen to keep.

Nothing owned by anyone else is ever touched. Everything is a dry run unless you ask it to delete.

## What it cleans up

An item is a candidate only when demo@ created it:

| Kind | How "created by demo@" is decided |
| --- | --- |
| `workflows` | Every channel the workflow sends to was last edited by demo@ (workflows record no creator) |
| `channels` | Last edited by demo@, and not used by a workflow that stays |
| `destinations` | Last edited by demo@, and not used by a channel that stays |
| `policies` | Every NRQL condition in the policy was created by demo@ (policies record no creator). Deleting a policy deletes its conditions. |
| `dashboards` | Owned by demo@. Deleting a dashboard deletes its pages. |
| `service-levels` | Created by demo@ |
| `workloads` | Created by demo@ |
| `api-keys` | User keys belonging to demo@, never the key the cleanup runs with |

An alert policy with no NRQL conditions has no way to tell who made it, and may hold older non-NRQL conditions. The cleanup doesn't delete those policies; it lists them under **Needs a look**.

## What it keeps

- **Anything with "DO NOT DELETE" in its name**, in any case, with or without spaces ("DONOTDELETE").
- **Anything matching [`keep.txt`](keep.txt).** Write one entry per line, matched against the item's name. Case doesn't matter, `*` and `?` are wildcards, and an exact ID or GUID works too. `#` starts a comment.
- **Anything still in use by something that stays:** for example, a demo@ destination that a kept channel sends to.

Each run lists every kept item and the reason, so you can see which rule kept what.

## Run it from GitHub

**Account cleanup** on the Actions tab (`.github/workflows/account-cleanup.yml`):

1. Run it with **apply** unticked. That's a dry run: the run summary lists what would be deleted and what's kept.
2. Read the list. If something should stay, add it to `keep.txt`, commit, and repeat the dry run.
3. Run it again with **apply** ticked.

| Input | Default | Meaning |
| --- | --- | --- |
| `apply` | off | Delete. Off means only list. |
| `accounts` | `6932347` | Accounts to clean, comma-separated |
| `key_accounts` | `all` | Accounts whose demo@ API keys to delete, or `all` for every account the key can see |
| `only` | (all kinds) | Limit to some kinds, such as `dashboards,workloads` |

It uses the repository secret `NEW_RELIC_API_KEY`, a User key. That key's user needs permission to delete what demo@ created, and must not be demo@. For example, demo@ itself isn't allowed to delete workloads. If the user lacks permission for something, that deletion fails with a 403. The others still go ahead, and the run is marked as failed.

## Run it locally

Python 3.8 or newer, with no packages to install:

```bash
export NEW_RELIC_API_KEY=NRAK-...
python3 account-cleanup/cleanup.py                                # dry run
python3 account-cleanup/cleanup.py --apply                        # delete
python3 account-cleanup/cleanup.py --accounts 6932347,4120837 --only dashboards
python3 account-cleanup/cleanup.py --help
```

Every option can also be set as an environment variable:

- `CLEANUP_APPLY=true`
- `CLEANUP_ACCOUNTS`
- `CLEANUP_KEY_ACCOUNTS`
- `CLEANUP_ONLY`
- `CLEANUP_OWNER`: whose leftovers to clean; default `demo@newrelicuniversity.com`
- `CLEANUP_KEEP_FILE`
- `NERDGRAPH_URL`: for EU accounts, `https://api.eu.newrelic.com/graphql`

## Moving it to its own repository

This folder has no ties to the rest of this repository. To move it:

1. Copy `account-cleanup/` and `.github/workflows/account-cleanup.yml` to the new repository.
2. Add the `NEW_RELIC_API_KEY` secret there.
