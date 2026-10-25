#!/bin/sh
# Readies the dev object storage (RustFS from compose) with the rc CLI: the bucket, and anyone may read images/ but never list it.
# Defaults match apps/api/.env.example; Hetzner's bucket and policy are set up by hand.
set -eu

endpoint="${STORAGE_ENDPOINT:-http://localhost:9000}"
bucket="${STORAGE_BUCKET:-kaja}"

rc alias set storage "$endpoint" "${STORAGE_ACCESS_KEY_ID:-kaja}" "${STORAGE_SECRET_ACCESS_KEY:-kaja-dev-storage}"
rc ready storage --timeout 30
rc mb "storage/$bucket" --ignore-existing

policy="$(mktemp)"
printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/images/*"]}]}' "$bucket" > "$policy"
# rc warns that this replaces the whole bucket policy; expected, this script owns it
rc anonymous set-json "$policy" "storage/$bucket"
