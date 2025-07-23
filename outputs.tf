# Output values for Turo-EZPass IAM resources

output "turo_ezpass_automation_role_arn" {
  description = "ARN of the Turo-EZPass automation IAM role"
  value       = aws_iam_role.turo_ezpass_automation_role.arn
}

output "turo_ezpass_automation_role_name" {
  description = "Name of the Turo-EZPass automation IAM role"
  value       = aws_iam_role.turo_ezpass_automation_role.name
}

output "turo_ezpass_automation_policy_arn" {
  description = "ARN of the Turo-EZPass automation IAM policy"
  value       = aws_iam_policy.turo_ezpass_automation_policy.arn
}

output "assume_role_command" {
  description = "AWS CLI command to assume the automation role"
  value       = "aws sts assume-role --role-arn ${aws_iam_role.turo_ezpass_automation_role.arn} --role-session-name turo-ezpass-automation --external-id ${var.external_id}"
}