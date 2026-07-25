# Indobase Design frontend — upstream Penpot frontend (MPL-2.0) with an
# Indobase branding overlay applied at build time. See ../NOTICE.md.
ARG PENPOT_VERSION=2.17.0
FROM penpotapp/frontend:${PENPOT_VERSION}

COPY indobase-design.css /var/www/app/css/indobase-design.css
COPY assets/ /var/www/app/images/indobase/
COPY rebrand.sh /tmp/rebrand.sh

RUN sh /tmp/rebrand.sh && rm /tmp/rebrand.sh
