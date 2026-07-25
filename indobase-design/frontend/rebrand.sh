#!/bin/sh
# Indobase branding overlay for the upstream Penpot frontend bundle.
# Runs once at image build time (see Dockerfile).
#
# What it does:
#   1. Replaces the product name "Penpot" with "Indobase Design" in all
#      user-visible strings (JS bundles include the translations).
#   2. Points penpot.app / help / community links at indobase.in.
#   3. Replaces favicons with the Indobase mark.
#   4. Swaps the logo <symbol>s in the SVG sprite for the Indobase mark.
#   5. Injects a small CSS override (indobase-design.css) into index.html.
#
# Upstream Penpot is MPL-2.0; per-file license notices are preserved (we only
# transform built artifacts, source remains upstream — see ../NOTICE.md).

set -eu

APP_DIR=/var/www/app

echo "==> Rebranding product strings"
find "$APP_DIR" -type f \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -name '*.json' -o -name '*.webmanifest' \) | while read -r f; do
  # Product name (capitalized occurrences are display strings; lowercase
  # `penpot` stays untouched: file format `.penpot`, API paths, class names).
  sed -i \
    -e 's|https://penpot\.app|https://indobase.in|g' \
    -e 's|https://help\.penpot\.app|https://indobase.in/docs|g' \
    -e 's|https://community\.penpot\.app|https://indobase.in|g' \
    -e 's|https://www\.penpot\.app|https://indobase.in|g' \
    -e 's|Penpot|Indobase Design|g' \
    -e 's|PENPOT|INDOBASE DESIGN|g' \
    "$f"
done

echo "==> Replacing favicons"
find "$APP_DIR/images" -maxdepth 1 -type f -name 'favicon*' | while read -r f; do
  case "$f" in
    *.png|*.ico) cp "$APP_DIR/images/indobase/favicon-128.png" "$f" ;;
  esac
done

echo "==> Swapping logo sprite symbols"
# The dashboard / auth logos live in SVG sprites as <symbol id="penpot-logo*">.
# Replace their contents with the Indobase diamond mark. Best-effort: if the
# sprite layout changes upstream this simply leaves the original in place.
INDOBASE_MARK='<path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round" d="M12 19.25 L18.75 14.75 L12 10.25 L5.25 14.75 Z"/><path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round" d="M12 16.85 L17.35 13.55 L12 10.25 L6.65 13.55 Z"/><path fill="currentColor" d="M12 14.35 L15.85 12 L12 9.65 L8.15 12 Z"/>'
find "$APP_DIR" -type f -name '*.svg' | while read -r f; do
  if grep -q 'penpot-logo' "$f" 2>/dev/null; then
    perl -0pi -e 's|(<symbol[^>]*id="penpot-logo[^"]*"[^>]*)( viewBox="[^"]*")?([^>]*>).*?(</symbol>)|$1 viewBox="0 0 24 24"$3'"$INDOBASE_MARK"'$4|gs' "$f" || true
    echo "    patched sprite: $f"
  fi
done

echo "==> Injecting CSS override into index.html"
if [ -f "$APP_DIR/index.html" ]; then
  sed -i 's|</head>|<link rel="stylesheet" href="/css/indobase-design.css"></head>|' "$APP_DIR/index.html"
fi

echo "==> Verifying no residual product naming in HTML entrypoint"
if grep -o 'Penpot' "$APP_DIR/index.html" >/dev/null 2>&1; then
  echo "WARN: index.html still mentions upstream product name" >&2
fi

echo "==> Rebrand complete"
