#!/bin/sh
# Indobase branding overlay for the upstream Penpot frontend bundle.
# Runs once at image build time (see Dockerfile).
#
# What it does:
#   1. Replaces the product name "Penpot" with "Indobase Design" in all
#      user-visible strings (JS bundles include the translations).
#   2. Points penpot.app / help / community links at indobase.in.
#   3. Replaces favicons + PWA / theme meta with Indobase brand tokens.
#   4. Swaps the logo <symbol>s in the SVG sprite for the Indobase mark.
#   5. Renames link-preview asset paths away from upstream filenames.
#   6. Injects a small CSS override (indobase-design.css) into index.html.
#
# Upstream Penpot is MPL-2.0; per-file license notices are preserved (we only
# transform built artifacts, source remains upstream — see ../NOTICE.md).

set -eu

APP_DIR=/var/www/app

echo "==> Rebranding product strings"
find "$APP_DIR" -type f \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -name '*.json' -o -name '*.webmanifest' \) | while read -r f; do
  # Product name (capitalized occurrences are display strings; lowercase
  # `penpot` stays untouched where it is a file format / API path / class name,
  # except for the explicit URL / social / preview renames below).
  sed -i \
    -e 's|https://penpot\.app|https://indobase.in|g' \
    -e 's|https://help\.penpot\.app|https://indobase.in/docs|g' \
    -e 's|https://community\.penpot\.app|https://indobase.in|g' \
    -e 's|https://www\.penpot\.app|https://indobase.in|g' \
    -e 's|@penpotapp|@indobase|g' \
    -e 's|/images/penpot-link-preview\.png|/images/indobase-link-preview.png|g' \
    -e 's|Penpot|Indobase Design|g' \
    -e 's|PENPOT|INDOBASE DESIGN|g' \
    "$f"
done

echo "==> Patching HTML meta (title already rebranded; force PWA / theme)"
if [ -f "$APP_DIR/index.html" ]; then
  # theme-color → Indobase dark surface (matches Email / Marketing suite)
  sed -i \
    -e 's|name="theme-color" content="[^"]*"|name="theme-color" content="#161616"|g' \
    -e 's|name="application-name" content="[^"]*"|name="application-name" content="Indobase Design"|g' \
    -e 's|name="apple-mobile-web-app-title" content="[^"]*"|name="apple-mobile-web-app-title" content="Indobase Design"|g' \
    "$APP_DIR/index.html"

  # Ensure application-name / apple title exist even if upstream omitted them.
  if ! grep -q 'application-name' "$APP_DIR/index.html"; then
    sed -i 's|</head>|<meta name="application-name" content="Indobase Design"></head>|' "$APP_DIR/index.html"
  fi
  if ! grep -q 'apple-mobile-web-app-title' "$APP_DIR/index.html"; then
    sed -i 's|</head>|<meta name="apple-mobile-web-app-title" content="Indobase Design"></head>|' "$APP_DIR/index.html"
  fi
fi

echo "==> Replacing favicons and link-preview artwork"
find "$APP_DIR/images" -maxdepth 1 -type f -name 'favicon*' | while read -r f; do
  case "$f" in
    *.png|*.ico) cp "$APP_DIR/images/indobase/favicon-128.png" "$f" ;;
  esac
done
# og:image / twitter:image — keep upstream filename as fallback AND write
# Indobase-named copy referenced after the string rewrite above.
find "$APP_DIR/images" -maxdepth 1 -type f -name '*link-preview*' | while read -r f; do
  cp "$APP_DIR/images/indobase/indobase-mark.png" "$f"
done
cp "$APP_DIR/images/indobase/indobase-mark.png" "$APP_DIR/images/indobase-link-preview.png"

echo "==> Swapping logo sprite symbols"
# The dashboard / auth / loader logos live as <symbol> defs inlined in
# index.html AND in the sprite SVGs. Upstream ids are prefixed
# (icon-penpot-logo, asset-penpot-logo, asset-penpot-logo-subtle, …), so match
# any prefix and rebuild the tag with a square viewBox (dropping the wide
# wordmark viewBox) plus the Indobase diamond mark. Best-effort: unknown
# layouts are simply left untouched.
INDOBASE_MARK='<path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round" d="M12 19.25 L18.75 14.75 L12 10.25 L5.25 14.75 Z"/><path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round" d="M12 16.85 L17.35 13.55 L12 10.25 L6.65 13.55 Z"/><path fill="currentColor" d="M12 14.35 L15.85 12 L12 9.65 L8.15 12 Z"/>'
{ echo "$APP_DIR/index.html"; find "$APP_DIR" -type f -name '*.svg'; } | while read -r f; do
  [ -f "$f" ] || continue
  if grep -q 'penpot-logo' "$f" 2>/dev/null; then
    perl -0pi -e 's|<symbol\b[^>]*?\bid="([A-Za-z-]*penpot-logo[^"]*)"[^>]*?>.*?</symbol>|<symbol id="$1" viewBox="0 0 24 24">'"$INDOBASE_MARK"'</symbol>|gs' "$f"
    echo "    patched sprite: $f"
  fi
done

echo "==> Injecting CSS override into index.html"
if [ -f "$APP_DIR/index.html" ]; then
  if ! grep -q 'indobase-design.css' "$APP_DIR/index.html"; then
    sed -i 's|</head>|<link rel="stylesheet" href="/css/indobase-design.css"></head>|' "$APP_DIR/index.html"
  fi
fi

echo "==> Verifying no residual product naming in HTML entrypoint"
if grep -o 'Penpot' "$APP_DIR/index.html" >/dev/null 2>&1; then
  echo "WARN: index.html still mentions upstream product name" >&2
fi
if grep -o 'penpot-link-preview' "$APP_DIR/index.html" >/dev/null 2>&1; then
  echo "WARN: index.html still references upstream link-preview filename" >&2
fi

echo "==> Rebrand complete"
