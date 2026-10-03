#!/usr/bin/env bash
# Builds dist/ from web/: stamps the build, lists every file for the service
# worker precache and writes version.txt with the cache name.
set -euo pipefail
cd "$(dirname "$0")"

STAMP="V$(date +%Y.%m.%d.%H%M).$(printf '%03d' $((RANDOM % 1000)))"
echo "export const BUILD = '$STAMP'" > web/js/build.js

rm -rf dist
cp -r web dist
cd dist

# Store screenshots and the social card are for the install dialog and link
# previews; the app never shows them, so they stay out of the precache.
mapfile -t FILES < <(find . -type f ! -name 'service-worker.js' ! -name 'version.txt' \
  ! -name '.htaccess' ! -path './screenshots/*' ! -name 'og.png' -printf '%P\n' | LC_ALL=C sort)
VERSION=$(cat "${FILES[@]}" | sha256sum | cut -c1-12)
CACHE="decibeles-${VERSION}"
echo "$CACHE" > version.txt

LIST=$(printf '"/%s",' "${FILES[@]}")
LIST="[${LIST%,}]"
python3 - "$CACHE" "$LIST" <<'PY'
import sys
cache, lst = sys.argv[1], sys.argv[2]
p = 'service-worker.js'
s = open(p).read().replace('__CACHE__', cache).replace('__PRECACHE__', lst)
open(p, 'w').write(s)
PY

echo "$STAMP  $CACHE  ${#FILES[@]} files"
