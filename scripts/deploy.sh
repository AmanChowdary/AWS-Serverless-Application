#!/bin/bash
# AWS Serverless Task Manager - Deployment Script
# Usage: ./scripts/deploy.sh [stack-name] [region] [environment]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
STACK_NAME=${1:-task-manager-api}
REGION=${2:-us-east-1}
ENVIRONMENT=${3:-prod}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if SAM CLI is installed
    if ! command -v sam &> /dev/null; then
        print_error "AWS SAM CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    print_success "All prerequisites are met!"
}

# Function to validate template
validate_template() {
    print_status "Validating SAM template..."
    
    if ! sam validate; then
        print_error "Template validation failed!"
        exit 1
    fi
    
    print_success "Template validation passed!"
}

# Function to run tests
run_tests() {
    print_status "Running tests..."
    
    if ! npm test; then
        print_error "Tests failed! Please fix the issues before deploying."
        exit 1
    fi
    
    print_success "All tests passed!"
}

# Function to build the application
build_application() {
    print_status "Building SAM application..."
    
    # Clean previous builds
    if [ -d ".aws-sam" ]; then
        print_status "Cleaning previous build..."
        rm -rf .aws-sam
    fi
    
    # Install dependencies
    print_status "Installing dependencies..."
    npm ci
    
    # Build SAM application
    if ! sam build; then
        print_error "Build failed!"
        exit 1
    fi
    
    print_success "Build completed successfully!"
}

# Function to deploy the application
deploy_application() {
    print_status "Deploying to AWS..."
    print_status "Stack Name: $STACK_NAME"
    print_status "Region: $REGION"
    print_status "Environment: $ENVIRONMENT"
    
    # Check if stack exists
    if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &> /dev/null; then
        print_warning "Stack '$STACK_NAME' already exists. Updating..."
        DEPLOY_MODE="update"
    else
        print_status "Creating new stack '$STACK_NAME'..."
        DEPLOY_MODE="create"
    fi
    
    # Deploy with appropriate parameters
    if ! sam deploy \
        --stack-name "$STACK_NAME" \
        --capabilities CAPABILITY_IAM \
        --region "$REGION" \
        --no-confirm-changeset \
        --no-fail-on-empty-changeset \
        --parameter-overrides Environment="$ENVIRONMENT"; then
        print_error "Deployment failed!"
        exit 1
    fi
    
    print_success "Deployment completed successfully!"
}

# Function to get stack outputs
get_stack_outputs() {
    print_status "Getting stack outputs..."
    
    if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs" --output table; then
        print_success "Stack outputs retrieved successfully!"
    else
        print_error "Failed to get stack outputs!"
        exit 1
    fi
}

# Function to create Cognito user (optional)
create_cognito_user() {
    print_status "Would you like to create a test user in Cognito? (y/n)"
    read -r response
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
        print_status "Creating test user..."
        
        # Get Cognito User Pool ID from stack outputs
        USER_POOL_ID=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" \
            --output text)
        
        if [ -z "$USER_POOL_ID" ]; then
            print_error "Could not retrieve Cognito User Pool ID from stack outputs."
            return 1
        fi
        
        # Create test user
        aws cognito-idp admin-create-user \
            --user-pool-id "$USER_POOL_ID" \
            --username "testuser" \
            --temporary-password "TempPass123!" \
            --user-attributes Name=email,Value="test@example.com" Name=email_verified,Value=true \
            --region "$REGION"
        
        if [ $? -eq 0 ]; then
            print_success "Test user created successfully!"
            print_status "Username: testuser"
            print_status "Temporary Password: TempPass123!"
            print_warning "Please change the password on first login."
        else
            print_error "Failed to create test user."
        fi
    fi
}

# Function to show deployment summary
show_deployment_summary() {
    print_status "=== Deployment Summary ==="
    print_status "Stack Name: $STACK_NAME"
    print_status "Region: $REGION"
    print_status "Environment: $ENVIRONMENT"
    print_status "Deployment Mode: $DEPLOY_MODE"
    
    # Get API URL
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
        --output text)
    
    if [ -n "$API_URL" ]; then
        print_success "API URL: $API_URL"
        print_status "Frontend URL: file://$(pwd)/frontend/index.html"
    fi
    
    print_status "=== Next Steps ==="
    print_status "1. Open the frontend/index.html file in your browser"
    print_status "2. Enter your API URL and JWT token"
    print_status "3. Start creating and managing tasks!"
    print_status "4. Check CloudWatch logs for monitoring"
}

# Main execution
main() {
    echo "=========================================="
    echo "AWS Serverless Task Manager - Deployment"
    echo "=========================================="
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Validate template
    validate_template
    
    # Run tests
    run_tests
    
    # Build application
    build_application
    
    # Deploy application
    deploy_application
    
    # Get stack outputs
    get_stack_outputs
    
    # Optionally create test user
    create_cognito_user
    
    # Show deployment summary
    show_deployment_summary
    
    echo ""
    print_success "Deployment process completed successfully!"
}

# Handle script interruption
trap 'print_error "Deployment interrupted by user"; exit 1' INT TERM

# Run main function
main "$@" 