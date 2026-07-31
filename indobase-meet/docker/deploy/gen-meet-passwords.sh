#!/usr/bin/env bash
# Generate strong XMPP / JWT secrets for Indobase Meet compose.
# Usage: ./gen-meet-passwords.sh >> .env
set -euo pipefail
gen() { openssl rand -hex 16; }
cat <<EOF
JICOFO_AUTH_PASSWORD=$(gen)
JVB_AUTH_PASSWORD=$(gen)
JIGASI_XMPP_PASSWORD=$(gen)
JIGASI_TRANSCRIBER_PASSWORD=$(gen)
JIBRI_RECORDER_PASSWORD=$(gen)
JIBRI_XMPP_PASSWORD=$(gen)
JWT_APP_ID=indobase_meet
JWT_APP_SECRET=$(openssl rand -hex 32)
MEET_HANDOFF_SECRET=$(openssl rand -hex 32)
EOF
