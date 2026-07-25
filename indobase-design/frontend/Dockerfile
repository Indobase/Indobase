# Indobase Design frontend — upstream Penpot frontend (MPL-2.0) with an
# Indobase branding overlay applied at build time. See ../NOTICE.md.
ARG PENPOT_VERSION=2.17.0
FROM penpotapp/frontend:${PENPOT_VERSION}

COPY indobase-design.css /var/www/app/css/indobase-design.css
COPY assets/ /var/www/app/images/indobase/
COPY rebrand.sh /tmp/rebrand.sh

# Upstream image is Alpine and runs as penpot:penpot; the overlay needs root
# (apk + file ownership) and perl for the multiline sprite substitution.
USER root
RUN apk add --no-cache perl \
  && sh /tmp/rebrand.sh \
  && rm -f /tmp/rebrand.sh \
  && apk del perl \
  && chown -R penpot:penpot /var/www/app
USER penpot:penpot
