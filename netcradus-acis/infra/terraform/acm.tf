# DNS-validated ACM certificate. DNS for netcradus.com is managed in
# Cloudflare, not Route 53, so Terraform cannot create the validation
# record itself the way aws_route53_record would - the exact CNAME
# name/value is exposed as a Terraform output for the operator to add in
# the Cloudflare dashboard. The certificate stays in PENDING_VALIDATION
# until that's done; nothing here blocks terraform apply on it (a
# real, external, manual step, not something to fake past).

resource "aws_acm_certificate" "main" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-cert"
  }
}
