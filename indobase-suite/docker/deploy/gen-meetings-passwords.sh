#!/usr/bin/env bash
# Generate strong XMPP service passwords for Indobase Meetings compose.
# Usage: ./gen-meetings-passwords.sh >> .env   (or merge into existing .env)
set -euo pipefail
gen() { openssl rand -hex 16; }
cat <<EOF
JICOFO_AUTH_PASSWORD=$(gen)
JVB_AUTH_PASSWORD=$(gen)
JIGASI_XMPP_PASSWORD=$(gen)
JIGASI_TRANSCRIBER_PASSWORD=$(gen)
JIBRI_RECORDER_PASSWORD=$(gen)
JIBRI_XMPP_PASSWORD=$(gen)
JWT_APP_ID=indobase_meetings
JWT_APP_SECRET=$(openssl rand -hex 32)
EOF
