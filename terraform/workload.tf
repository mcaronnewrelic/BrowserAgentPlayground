# Everything but the two apps is found by search, so recreating a dashboard, monitor or service level
# (by hand or with terraform apply) puts it back in the workload automatically.
resource "newrelic_workload" "agent_playground" {
  account_id        = var.account_id
  name              = "Agent Playground"
  entity_guids      = [var.browser_entity_guid, var.apm_entity_guid]
  scope_account_ids = [var.account_id]

  entity_search_query {
    query = "domain = 'SYNTH' AND type = 'MONITOR' AND name LIKE 'Agent Playground - %'"
  }

  entity_search_query {
    query = "type = 'DASHBOARD' AND name LIKE 'Agent Playground%'"
  }

  entity_search_query {
    query = "type = 'SERVICE_LEVEL' AND name LIKE 'Agent Playground%'"
  }

  entity_search_query {
    query = "type = 'HOST' AND tags.project = 'agent-playground'"
  }
}
