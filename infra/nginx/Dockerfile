FROM owasp/modsecurity-crs:4.25.1-nginx-alpine-lts

# this keeps the project's Nginx routing, but run it on top of the official
# ModSecurity + OWASP Core Rule Set image.

USER root
COPY default.conf /etc/nginx/templates/conf.d/default.conf.template
COPY status.html /usr/share/nginx/html/status.html
COPY auth-waf-exclusions.conf /etc/modsecurity.d/owasp-crs/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf
COPY grafana-waf-exclusions.conf /etc/modsecurity.d/grafana-waf-exclusions.conf
COPY start.sh /start.sh
RUN chmod +x /start.sh \
    && mkdir -p /etc/nginx/certs \
    && chown -R nginx:nginx /etc/nginx/certs \
    && rm -f /docker-entrypoint.d/10-generate-certificate.sh

USER nginx
ENTRYPOINT ["/start.sh"]
CMD ["nginx", "-g", "daemon off;"]
