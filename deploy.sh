#!/usr/bin/env bash
# Builds and publishes to https://decibeles.ip1.cc (Apache on host.framework.cc).
set -euo pipefail
cd "$(dirname "$0")"
./build.sh
rsync -az --delete dist/ root@host.framework.cc:/var/www/decibeles.ip1.cc/
ssh root@host.framework.cc "chown -R www-data:www-data /var/www/decibeles.ip1.cc"
echo "https://decibeles.ip1.cc  $(cat dist/version.txt)"
