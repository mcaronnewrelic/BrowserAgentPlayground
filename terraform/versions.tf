terraform {
  required_version = ">= 1.10"

  # Locally: export AWS_PROFILE=<your sso profile>. On GitHub the workflow supplies credentials.
  backend "s3" {
    bucket       = "brosweragentplayground-terraform-state"
    key          = "agent-playground/terraform.tfstate"
    region       = "us-west-2"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    newrelic = {
      source  = "newrelic/newrelic"
      version = "~> 3.0"
    }
  }
}

provider "newrelic" {
  account_id = var.account_id
  api_key    = var.api_key
  region     = var.region
}
