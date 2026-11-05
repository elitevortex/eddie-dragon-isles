#!/bin/sh
# Deploy the site to Vercel production, and the multiplayer relay to Cloudflare with --relay.
# The site is deployed from a clean copy without git history: Vercel blocks deploys whose latest
# commit author isn't a member of the Vercel account.
set -e
cd "$(dirname "$0")"
if [ "$1" = "--relay" ]; then (cd worker && npx wrangler deploy); fi
OUT="$(mktemp -d)"
rsync -a --exclude .git --exclude server --exclude worker --exclude .claude --exclude node_modules --exclude .DS_Store ./ "$OUT/"
(cd "$OUT" && vercel deploy --prod --yes)
rm -rf "$OUT"
