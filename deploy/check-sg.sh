#!/bin/bash
set -e
TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
SG=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/security-groups)
REGION=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)
INSTANCE=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
echo "INSTANCE=$INSTANCE"
echo "REGION=$REGION"
echo "SG_NAME=$SG"

# Check if aws CLI exists, install if not
if ! command -v aws &> /dev/null; then
  echo "Installing AWS CLI..."
  sudo dnf install -y awscli 2>&1 | tail -3
fi
aws --version 2>&1 || true
