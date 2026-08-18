data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/${var.project_name}/${var.environment}/app"
  retention_in_days = 30
}

# Bootstraps the instance itself (Docker, CloudWatch agent) but
# deliberately does NOT pull application code or start the stack - that
# happens via a separate, re-runnable SSM command
# (infra/scripts/deploy-to-aws.sh) after this instance exists, so a real
# deploy doesn't require replacing the instance every time.
locals {
  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail
    dnf install -y docker git jq
    systemctl enable --now docker
    usermod -aG docker ec2-user

    # Docker Compose v2 plugin (dnf's docker package doesn't bundle it on AL2023)
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -sL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

    # CloudWatch agent - ships container/system logs and metrics real-time.
    dnf install -y amazon-cloudwatch-agent
    cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'CWCONFIG'
    {
      "logs": {
        "logs_collected": {
          "files": {
            "collect_list": [
              {
                "file_path": "/var/log/messages",
                "log_group_name": "${aws_cloudwatch_log_group.app.name}",
                "log_stream_name": "{instance_id}/system"
              }
            ]
          }
        }
      },
      "metrics": {
        "metrics_collected": {
          "mem": { "measurement": ["mem_used_percent"] },
          "disk": { "measurement": ["used_percent"], "resources": ["/"] }
        }
      }
    }
    CWCONFIG
    /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
      -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

    mkdir -p /opt/acis
    echo "bootstrap complete" > /opt/acis/bootstrap.done
  EOF
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.app_instance_type
  subnet_id              = aws_subnet.private[0].id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name
  key_name               = var.ssh_key_name # null by default - SSM is the real access path, see iam.tf

  # 24 containers incl. Elasticsearch/Kafka/the ai-service's PyTorch deps
  # already needed real, non-trivial local disk (image layers + volumes)
  # in the already-verified local deployment - sized with headroom, not
  # guessed.
  root_block_device {
    volume_size           = 100
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_tokens   = "required" # IMDSv2 only - a real, standard EC2 hardening step (blocks the classic SSRF-to-instance-credentials attack path)
    http_endpoint = "enabled"
  }

  user_data                   = local.user_data
  user_data_replace_on_change = true

  tags = {
    Name = "${var.project_name}-app-${var.environment}"
  }
}
