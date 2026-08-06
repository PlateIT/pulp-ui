ARG NODE_IMAGE=node:24-alpine
ARG PULP_BASE_IMAGE=pulp/pulp@sha256:15e77f2ca6321efb0dcb175167988b52a62be6f940d07432c5d186e833070aed

FROM ${NODE_IMAGE} AS ui-builder

WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./

ARG PULP_UI_COMMIT=container-build
RUN PULP_UI_COMMIT="${PULP_UI_COMMIT}" npm run lint:ts \
    && PULP_UI_COMMIT="${PULP_UI_COMMIT}" npm run eslint \
    && PULP_UI_COMMIT="${PULP_UI_COMMIT}" npm run build

FROM ${PULP_BASE_IMAGE}

LABEL org.opencontainers.image.source="https://github.com/PlateIT/pulp-ui"
LABEL org.opencontainers.image.description="Pulp OCI image with session-aware Pulp UI"

RUN rm -rf /var/lib/operator/static/pulp_ui/*
COPY --chown=1001:1001 --from=ui-builder /src/dist/ /var/lib/operator/static/pulp_ui/
COPY ui-cache.conf /etc/nginx/pulp/ui_cache.conf
COPY axalon-auth-entrypoint.sh /usr/local/bin/axalon-auth-entrypoint
RUN chmod 0755 /usr/local/bin/axalon-auth-entrypoint

CMD ["/usr/local/bin/axalon-auth-entrypoint"]
