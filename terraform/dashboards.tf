# One dashboard per JSON file in ../newrelic/dashboards, the same files dashboards.sh uses.
locals {
  dashboard_files = fileset("${path.module}/../newrelic/dashboards", "*.json")

  dashboards = {
    for file in local.dashboard_files : trimsuffix(file, ".json") => jsondecode(file("${path.module}/../newrelic/dashboards/${file}"))
  }

  # Exported dashboards carry widget ids New Relic assigned; they don't belong in a definition.
  dashboard_json = {
    for key, dashboard in local.dashboards : key => replace(
      jsonencode(merge(dashboard, {
        pages = [for page in dashboard.pages : merge(page, {
          widgets = [for widget in page.widgets : { for k, v in widget : k => v if k != "id" }]
        })]
      })),
      "/\"accountIds\":\\[[^\\]]*\\]/",
      "\"accountIds\":[${var.account_id}]"
    )
  }
}

resource "newrelic_one_dashboard_json" "dashboard" {
  for_each = local.dashboard_json

  account_id = var.account_id
  json       = each.value
}
