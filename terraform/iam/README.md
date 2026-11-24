# IAM for the Terraform GitHub Action

Lets the **Terraform** workflow reach the state bucket through OIDC, with no stored AWS keys. Only runs on `main` can assume the role.

One-time setup, in AWS account 365309403645 (skip step 1 if the account already has the GitHub OIDC provider):

1. Create the OIDC provider `token.actions.githubusercontent.com` with audience `sts.amazonaws.com`.
2. Create the role from both files, then save its ARN as the repo variable `AWS_TERRAFORM_ROLE_ARN`:

```bash
aws iam create-role --role-name agent-playground-terraform \
  --assume-role-policy-document file://terraform/iam/trust-policy.json
aws iam put-role-policy --role-name agent-playground-terraform --policy-name state-bucket \
  --policy-document file://terraform/iam/permissions-policy.json
gh variable set AWS_TERRAFORM_ROLE_ARN --body "arn:aws:iam::365309403645:role/agent-playground-terraform"
```
