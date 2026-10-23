#!/usr/bin/env bash
set -euo pipefail

mkdir -p data/postgres data/sandbox data/storage
sudo chown 70:70 data/postgres
sudo chmod 700 data/postgres
sudo chown 10001:10001 data/storage
sudo chmod 750 data/storage
