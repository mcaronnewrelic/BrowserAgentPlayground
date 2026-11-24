variable "api_key" {
  description = "New Relic User key (NRAK-...)."
  type        = string
  sensitive   = true
}

variable "account_id" {
  type    = number
  default = 6932347
}

variable "region" {
  description = "US or EU."
  type        = string
  default     = "US"
}

variable "alert_email" {
  type    = string
  default = "demo@newrelicuniversity.com"
}

variable "site_url" {
  type    = string
  default = "https://browser.nru.to"
}

variable "monitor_locations" {
  type    = list(string)
  default = ["US_WEST_1", "US_EAST_1"]
}

variable "host_name" {
  description = "The infrastructure host to watch (NRIA_DISPLAY_NAME in compose.yaml)."
  type        = string
  default     = "browser.nru.to"
}

variable "memory_percent" {
  type    = number
  default = 90
}

variable "browser_entity_guid" {
  type    = string
  default = "NjkzMjM0N3xCUk9XU0VSfEFQUExJQ0FUSU9OfDExMzQ3Mzk2OTQ"
}

variable "apm_entity_guid" {
  type    = string
  default = "NjkzMjM0N3xBUE18QVBQTElDQVRJT058MTExNzgyNTc1Ng"
}
