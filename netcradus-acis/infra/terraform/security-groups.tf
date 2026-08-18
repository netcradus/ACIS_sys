# ALB - the only thing reachable from the public internet.
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Public ALB - HTTP(S) only, from anywhere"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP (redirected to HTTPS by the listener)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS - main app"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS - Keycloak (real login/OAuth endpoints; admin console reachable too but gated by strong Keycloak admin credentials, see keycloak-security-notes in README)"
    from_port   = 8443
    to_port     = 8443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS - Grafana"
    from_port   = 8444
    to_port     = 8444
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-alb-sg" }
}

# App host - never reachable except from the ALB. No SSH ingress anywhere
# - operational access is via SSM Session Manager (see iam.tf), which
# needs no inbound port open at all (the agent polls outbound over
# HTTPS/443 through the NAT Gateway).
resource "aws_security_group" "app" {
  name        = "${var.project_name}-app-sg"
  description = "Application host - reachable only from the ALB, no direct internet or SSH ingress"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Frontend/nginx (proxies /api,/ws to the gateway)"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  ingress {
    description     = "Keycloak (real HTTP port behind the ALB TLS termination)"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  ingress {
    description     = "Grafana"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  # NOTE: external syslog/Splunk HEC ingestion (ports 20514-20563,
  # host-mapped directly in the local docker-compose.prod.yml) is
  # intentionally NOT wired up in this AWS pass. The app host lives in a
  # private subnet with no public IP - an ALB doesn't forward raw UDP or
  # 50-wide TCP ranges, so reaching those ports from real external
  # forwarders needs a dedicated Network Load Balancer, a real, separate
  # piece of infrastructure. Opening 0.0.0.0/0 on this security group
  # alone would have been dead configuration (no route to it exists
  # without an NLB), not a real exposure - left out rather than added for
  # appearances. Real follow-up: add an NLB with TCP/UDP listeners on this
  # port range forwarding to the app host if/when real syslog forwarders
  # need to reach this deployment.

  egress {
    description = "Outbound only (Docker Hub/ECR pulls, SMTP, package installs) via NAT - no direct inbound path exists to reach this host except through the ALB above"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-app-sg" }
}

# RDS - reachable only from the app host, never from the internet, never
# even from other things in this VPC.
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "RDS PostgreSQL - reachable only from the application host"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from the app host only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-rds-sg" }
}
