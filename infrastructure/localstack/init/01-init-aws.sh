#!/bin/bash
# Initializes LocalStack S3 buckets for local development.
# Runs automatically on container start via the /etc/localstack/init/ready.d hook.
# Idempotent: safe to re-run if LocalStack is restarted.

set -euo pipefail

echo "Initializing LocalStack S3 buckets..."

# Buckets
for bucket in design-platform-assets design-platform-exports; do
  if ! awslocal s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    awslocal s3api create-bucket --bucket "$bucket" --region us-east-1
  fi
done

# CORS configured for the local Next.js frontend
awslocal s3api put-bucket-cors \
  --bucket design-platform-assets \
  --cors-configuration '{"CORSRules":[{"AllowedOrigins":["http://localhost:3000","http://127.0.0.1:3000"],"AllowedMethods":["GET","PUT","POST","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"]}]}'

awslocal s3api put-bucket-cors \
  --bucket design-platform-exports \
  --cors-configuration '{"CORSRules":[{"AllowedOrigins":["http://localhost:3000","http://127.0.0.1:3000"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"]}]}'

echo "LocalStack initialization completed."
