# Availability ones leave out the demo's deliberate failure (the Tracing page's /api/fail button).
locals {
  deliberate_failure = "WebTransaction/Custom/api/fail"
  apm_web            = "entityGuid = '${var.apm_entity_guid}' AND transactionType = 'Web'"
  browser_ajax       = "entityGuid = '${var.browser_entity_guid}' AND requestUrl NOT LIKE '%/api/fail%'"
  browser_lcp        = "entityGuid = '${var.browser_entity_guid}' AND timingName = 'largestContentfulPaint'"
}

resource "newrelic_service_level" "api_latency" {
  guid        = var.apm_entity_guid
  name        = "Agent Playground API - Latency"
  description = "Web requests the server answers in under half a second."

  events {
    account_id = var.account_id

    valid_events {
      from  = "Transaction"
      where = local.apm_web
    }

    good_events {
      from  = "Transaction"
      where = "${local.apm_web} AND duration < 0.5"
    }
  }

  objective {
    target = 95

    time_window {
      rolling {
        count = 7
        unit  = "DAY"
      }
    }
  }
}

resource "newrelic_service_level" "api_success" {
  guid        = var.apm_entity_guid
  name        = "Agent Playground API - Success"
  description = "Web requests that end without an unexpected error. Leaves out ${local.deliberate_failure}, which fails on purpose."

  events {
    account_id = var.account_id

    valid_events {
      from  = "Transaction"
      where = "${local.apm_web} AND name != '${local.deliberate_failure}'"
    }

    bad_events {
      from  = "TransactionError"
      where = "entityGuid = '${var.apm_entity_guid}' AND error.expected IS FALSE AND transactionName != '${local.deliberate_failure}'"
    }
  }

  objective {
    target = 99

    time_window {
      rolling {
        count = 7
        unit  = "DAY"
      }
    }
  }
}

resource "newrelic_service_level" "browser_latency" {
  guid        = var.browser_entity_guid
  name        = "Agent Playground Browser - Latency (LCP)"
  description = "Page loads whose Largest Contentful Paint is under 2.5 seconds (the \"good\" Core Web Vitals threshold)."

  events {
    account_id = var.account_id

    valid_events {
      from  = "PageViewTiming"
      where = local.browser_lcp
    }

    good_events {
      from  = "PageViewTiming"
      where = "${local.browser_lcp} AND largestContentfulPaint < 2.5"
    }
  }

  objective {
    target = 95

    time_window {
      rolling {
        count = 7
        unit  = "DAY"
      }
    }
  }
}

resource "newrelic_service_level" "browser_availability" {
  guid        = var.browser_entity_guid
  name        = "Agent Playground Browser - Availability (AJAX)"
  description = "AJAX requests from the pages that get an answer (not a 5xx or a network failure). Leaves out /api/fail, which fails on purpose."

  events {
    account_id = var.account_id

    valid_events {
      from  = "AjaxRequest"
      where = local.browser_ajax
    }

    bad_events {
      from  = "AjaxRequest"
      where = "${local.browser_ajax} AND (httpResponseCode >= 500 OR httpResponseCode = 0)"
    }
  }

  objective {
    target = 99

    time_window {
      rolling {
        count = 7
        unit  = "DAY"
      }
    }
  }
}
