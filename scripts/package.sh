#!/usr/bin/env bash
# Builds the plugin and packs dist/ as artifacts/<id>-<version>.zip, the layout Grafana installs.
set -euo pipefail
cd "$(dirname "$0")/.."

id=$(node -p "require('./src/plugin.json').id")
version=$(node -p "require('./package.json').version")

npm run build
# Signs when a token is set; pass ROOT_URLS for a private signature.
if [[ -n "${GRAFANA_ACCESS_POLICY_TOKEN:-}" ]]; then
  npx --yes @grafana/sign-plugin@latest ${ROOT_URLS:+--rootUrls "$ROOT_URLS"}
fi

rm -rf "artifacts/$id" "artifacts/$id-$version.zip"
mkdir -p artifacts
cp -r dist "artifacts/$id"
(cd artifacts && zip -qr "$id-$version.zip" "$id")
rm -rf "artifacts/$id"
echo "artifacts/$id-$version.zip"
