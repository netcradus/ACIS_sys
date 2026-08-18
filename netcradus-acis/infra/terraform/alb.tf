resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = true

  tags = {
    Name = "${var.project_name}-alb"
  }
}

# Three target groups, one per internal service port - replicates the
# same port-based separation the local deployment's Caddy config already
# uses (443 main / 8443 Keycloak / 8444 Grafana), just with the ALB doing
# the TLS termination + routing that Caddy did locally.

resource "aws_lb_target_group" "frontend" {
  name     = "${var.project_name}-frontend-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }
}

resource "aws_lb_target_group" "keycloak" {
  name     = "${var.project_name}-keycloak-tg"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  # /health/ready does not exist on this deployment - Keycloak only exposes
  # it with --health-enabled=true, which docker-compose.prod.yml's actual
  # `command:` never sets. Found via a real production smoke test: this
  # target group reported unhealthy (404) even though the app itself was
  # serving real traffic fine - the ALB was silently "failing open" because
  # this target group has exactly one target and 100% of it was unhealthy
  # (AWS ALB forwards anyway when a target group has zero healthy targets,
  # rather than blackholing everything - real behavior observed, not
  # assumed). Fixed to match the exact endpoint docker-compose's own
  # container healthcheck already proves reliable for this image.
  health_check {
    path                = "/realms/master/.well-known/openid-configuration"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }
}

resource "aws_lb_target_group" "grafana" {
  name     = "${var.project_name}-grafana-tg"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    path                = "/api/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }
}

resource "aws_lb_target_group_attachment" "frontend" {
  target_group_arn = aws_lb_target_group.frontend.arn
  target_id        = aws_instance.app.id
  port             = 80
}

resource "aws_lb_target_group_attachment" "keycloak" {
  target_group_arn = aws_lb_target_group.keycloak.arn
  target_id        = aws_instance.app.id
  port             = 8080
}

resource "aws_lb_target_group_attachment" "grafana" {
  target_group_arn = aws_lb_target_group.grafana.arn
  target_id        = aws_instance.app.id
  port             = 3000
}

# HTTP -> HTTPS redirect (port 80).
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# Main app - HTTPS on 443.
resource "aws_lb_listener" "https_main" {
  count             = var.enable_https_listeners ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# Keycloak - HTTPS on 8443 (same real login/OAuth surface the frontend
# redirects to; matches the local deployment's port convention exactly so
# VITE_KEYCLOAK_URL doesn't need special-casing between environments).
resource "aws_lb_listener" "https_keycloak" {
  count             = var.enable_https_listeners ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 8443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.keycloak.arn
  }
}

# Keycloak's admin console must never be reachable from the public internet
# (real production-readiness requirement - it's a live credential-stuffing/
# brute-force target otherwise, and offers no benefit to real end users, who
# only ever need /realms/* for login/OAuth). Verified safe to block: every
# backend service reaches Keycloak's admin REST API via the internal Docker
# network (KEYCLOAK_URL=http://keycloak:8080 in docker-compose.prod.yml),
# never through this public ALB - only the browser-facing login flow
# (VITE_KEYCLOAK_URL) uses the public 8443 listener, and that flow never
# touches /admin/*. Real admin console access, when actually needed, goes
# through `aws ssm start-session` + a local port-forward to the instance
# instead - no SSH, no public exposure.
resource "aws_lb_listener_rule" "keycloak_block_admin" {
  count        = var.enable_https_listeners ? 1 : 0
  listener_arn = aws_lb_listener.https_keycloak[0].arn
  priority     = 1

  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }

  condition {
    path_pattern {
      values = ["/admin", "/admin/*"]
    }
  }
}

# Grafana - HTTPS on 8444.
resource "aws_lb_listener" "https_grafana" {
  count             = var.enable_https_listeners ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 8444
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.grafana.arn
  }
}
