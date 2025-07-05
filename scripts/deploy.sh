#!/bin/bash
# Deployment script for AWS Serverless Task Manager API
# Usage: ./scripts/deploy.sh <stack-name> <region>

set -e

STACK_NAME=${1:-task-manager-api}
REGION=${2:-us-east-1}

# Build the SAM application
echo "Building SAM application..."
sam build

# Deploy the SAM application
echo "Deploying SAM application to stack: $STACK_NAME in region: $REGION..."
sam deploy --stack-name "$STACK_NAME" --capabilities CAPABILITY_IAM --region "$REGION" --no-confirm-changeset --no-fail-on-empty-changeset

echo "Deployment complete." 