output "alb_dns_name" {
  description = "ALB's own DNS name - the CNAME target for the domain's DNS record in Cloudflare"
  value       = aws_lb.main.dns_name
}

output "acm_validation_records" {
  description = "DNS validation record(s) to add in Cloudflare BEFORE the certificate will issue. Type=CNAME, add exactly the name/value shown, proxy status DNS-only (grey cloud, not orange) so ACM can actually see it."
  value = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

output "dns_records_needed" {
  description = "The real DNS records to add in Cloudflare for acis.netcradus.com to work at all - both required, in order (validation first)"
  value       = <<-EOT
    1) ACM validation (add first, wait for the cert to show ISSUED):
       ${jsonencode({ for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => "${dvo.resource_record_name} CNAME ${dvo.resource_record_value}" })}

    2) App domain (add after step 1 is confirmed issued):
       ${var.domain_name} CNAME ${aws_lb.main.dns_name}
       (Cloudflare proxy status: DNS-only / grey cloud - this ALB already
       terminates real TLS with a real ACM cert; Cloudflare's own proxy
       TLS would just add a second, redundant hop and complicate the
       OAuth/WebSocket paths this app depends on.)
  EOT
}

output "instance_id" {
  description = "App host instance ID - use with `aws ssm start-session --target <id>` for shell access (no SSH needed)"
  value       = aws_instance.app.id
}

output "instance_private_ip" {
  value = aws_instance.app.private_ip
}

output "rds_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = false
}

output "rds_address" {
  description = "Hostname only, no port - what DB_HOST / Keycloak's --db-url-host actually need"
  value       = aws_db_instance.main.address
}

output "secrets_manager_secret_arn" {
  value = aws_secretsmanager_secret.app_secrets.arn
}

output "s3_deploy_bucket" {
  value = aws_s3_bucket.deploy_artifacts.bucket
}

output "ecr_repository_urls" {
  value = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}

output "cloudwatch_log_group" {
  value = aws_cloudwatch_log_group.app.name
}
