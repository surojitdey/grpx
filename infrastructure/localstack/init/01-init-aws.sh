#!/bin/bash
# Initializes LocalStack S3 buckets for local development.
# Runs automatically on container start via the /etc/localstack/init/ready.d hook.

set -e

echo "Initializing LocalStack S3 buckets..."

awslocal s3 mb s3://design-platform-assets || true
awslocal s3 mb s3://design-platform-exports || true

awslocal s3api put-bucket-cors \
  --bucket design-platform-assets \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedOrigins": ["http://localhost:3000"],
        "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"]
      }
    ]
  }'

awslocal s3api put-bucket-cors \
  --bucket design-platform-exports \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedOrigins": ["http://localhost:3000"],
        "AllowedMethods": ["GET"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"]
      }
    ]
  }'

echo "LocalStack initialization completed."
