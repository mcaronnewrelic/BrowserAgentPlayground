locals {
  # The alert condition and the workload find monitors by this prefix.
  monitor_prefix = "Agent Playground - "
  site_url       = trimsuffix(var.site_url, "/")

  monitor_script = {
    for name in ["api-health", "journey"] : name => replace(
      chomp(file("${path.module}/../newrelic/monitors/${name}.js")), "__SITE_URL__", local.site_url
    )
  }
}

resource "newrelic_synthetics_monitor" "home_page" {
  account_id        = var.account_id
  name              = "${local.monitor_prefix}Home page (ping)"
  type              = "SIMPLE"
  uri               = "${local.site_url}/"
  period            = "EVERY_HOUR"
  status            = "ENABLED"
  locations_public  = var.monitor_locations
  validation_string = "Click it."
  verify_ssl        = true
}

resource "newrelic_synthetics_script_monitor" "backend_health" {
  account_id           = var.account_id
  name                 = "${local.monitor_prefix}Backend health (API)"
  type                 = "SCRIPT_API"
  period               = "EVERY_HOUR"
  status               = "ENABLED"
  locations_public     = var.monitor_locations
  script               = local.monitor_script["api-health"]
  runtime_type         = "NODE_API"
  runtime_type_version = "22.23.4"
  script_language      = "JAVASCRIPT"
}

resource "newrelic_synthetics_script_monitor" "journey" {
  account_id                              = var.account_id
  name                                    = "${local.monitor_prefix}Learning path journey (browser)"
  type                                    = "SCRIPT_BROWSER"
  period                                  = "EVERY_HOUR"
  status                                  = "ENABLED"
  locations_public                        = var.monitor_locations
  script                                  = local.monitor_script["journey"]
  runtime_type                            = "CHROME_BROWSER"
  runtime_type_version                    = "LATEST"
  script_language                         = "JAVASCRIPT"
  browsers                                = ["CHROME"]
  devices                                 = ["DESKTOP"]
  enable_screenshot_on_failure_and_script = true
}
