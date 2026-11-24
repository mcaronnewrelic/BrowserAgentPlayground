# Shared by the synthetic-check alerts and the host-health alert.
resource "newrelic_notification_destination" "email" {
  account_id = var.account_id
  name       = "Agent Playground alert email"
  type       = "EMAIL"

  property {
    key   = "email"
    value = var.alert_email
  }
}

resource "newrelic_notification_channel" "email" {
  account_id     = var.account_id
  name           = "Agent Playground alert email"
  type           = "EMAIL"
  product        = "IINT"
  destination_id = newrelic_notification_destination.email.id

  property {
    key   = "subject"
    value = "{{ issueTitle }}"
  }
}

# A channel can serve only one workflow, so host health gets its own on the same destination.
resource "newrelic_notification_channel" "host_health_email" {
  account_id     = var.account_id
  name           = "Agent Playground host health email"
  type           = "EMAIL"
  product        = "IINT"
  destination_id = newrelic_notification_destination.email.id

  property {
    key   = "subject"
    value = "{{ issueTitle }}"
  }
}

# ---- Synthetic checks ----------------------------------------------------------------------------------

resource "newrelic_alert_policy" "synthetics" {
  account_id          = var.account_id
  name                = "Agent Playground - Synthetic checks"
  incident_preference = "PER_CONDITION_AND_TARGET"
}

resource "newrelic_nrql_alert_condition" "synthetic_check_failed" {
  account_id = var.account_id
  policy_id  = newrelic_alert_policy.synthetics.id
  name       = "A synthetic check failed"
  type       = "static"
  enabled    = true

  nrql {
    query = "SELECT filter(count(*), WHERE result = 'FAILED') FROM SyntheticCheck WHERE monitorName LIKE '${local.monitor_prefix}%' FACET monitorName"
  }

  # Checks run hourly, so the window is an hour; the event timer closes it a few minutes after a result arrives.
  aggregation_method = "EVENT_TIMER"
  aggregation_window = 3600
  aggregation_timer  = 300

  critical {
    operator                        = "ABOVE"
    threshold                       = 0
    threshold_duration              = 3600
    threshold_occurrences           = "AT_LEAST_ONCE"
    disable_health_status_reporting = true
  }

  violation_time_limit_seconds = 86400
}

resource "newrelic_workflow" "synthetics" {
  account_id            = var.account_id
  name                  = "Agent Playground - Synthetic check alerts"
  muting_rules_handling = "NOTIFY_ALL_ISSUES"
  enrichments_enabled   = false
  enabled               = true

  issues_filter {
    name = "Agent Playground - Synthetic check alerts"
    type = "FILTER"

    predicate {
      attribute = "labels.policyIds"
      operator  = "EXACTLY_MATCHES"
      values    = [newrelic_alert_policy.synthetics.id]
    }
  }

  destination {
    channel_id            = newrelic_notification_channel.email.id
    notification_triggers = ["ACTIVATED", "CLOSED"]
  }
}

# ---- Host health -----------------------------------------------------------------------------------------

resource "newrelic_alert_policy" "host_health" {
  account_id          = var.account_id
  name                = "Agent Playground - Host health"
  incident_preference = "PER_CONDITION_AND_TARGET"
}

# The condition that OOM-killed the box on 2026-10-28. Five minutes above the threshold, so a spike won't page anyone.
resource "newrelic_nrql_alert_condition" "host_memory" {
  account_id = var.account_id
  policy_id  = newrelic_alert_policy.host_health.id
  name       = "Host memory nearly full"
  type       = "static"
  enabled    = true

  nrql {
    query = "SELECT average(memoryUsedPercent) FROM SystemSample WHERE entityName = '${var.host_name}'"
  }

  aggregation_method = "EVENT_FLOW"
  aggregation_window = 60
  aggregation_delay  = 120
  fill_option        = "none"

  critical {
    operator                        = "ABOVE"
    threshold                       = var.memory_percent
    threshold_duration              = 300
    threshold_occurrences           = "ALL"
    disable_health_status_reporting = true
  }

  violation_time_limit_seconds = 86400
}

resource "newrelic_workflow" "host_health" {
  account_id            = var.account_id
  name                  = "Agent Playground - Host health alerts"
  muting_rules_handling = "NOTIFY_ALL_ISSUES"
  enrichments_enabled   = false
  enabled               = true

  issues_filter {
    name = "Agent Playground - Host health alerts"
    type = "FILTER"

    predicate {
      attribute = "labels.policyIds"
      operator  = "EXACTLY_MATCHES"
      values    = [newrelic_alert_policy.host_health.id]
    }
  }

  destination {
    channel_id            = newrelic_notification_channel.host_health_email.id
    notification_triggers = ["ACTIVATED", "CLOSED"]
  }
}
