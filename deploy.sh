#!/bin/sh
# Deploy Dragon Isles on its own: the game at the root of the "eddie-dragon-isles" Vercel
# project, with only the files it needs (none of the other portfolio versions).
#   ./deploy.sh            the site
#   ./deploy.sh --relay    the Cloudflare multiplayer relay too
# The bundle is a clean copy without git history: Vercel blocks deploys whose latest commit
# author isn't a member of the Vercel account.
set -e
cd "$(dirname "$0")"
if [ "$1" = "--relay" ]; then (cd worker && npx wrangler deploy); fi
OUT="$(mktemp -d)"
# the page lives at the root; its "../" links to data.js, assets/ and ar/hands.js resolve there too
cp -R dragon/. "$OUT/"
cp data.js "$OUT/"
mkdir -p "$OUT/assets" "$OUT/ar"
cp -R assets/photos assets/reels assets/portrait-baby.jpg assets/edwarddchann_2027.pdf "$OUT/assets/"
cp ar/hands.js "$OUT/ar/"
find "$OUT" -name .DS_Store -delete
cd "$OUT"
vercel link --yes --project eddie-dragon-isles >/dev/null
vercel deploy --prod --yes
cd - >/dev/null
rm -rf "$OUT"
