# Build from the repo root: docker build -t browser-agent-playground .
# Serves the demo pages and the tracing API from one origin, and injects the browser
# agent through the APM agent. Needs NEW_RELIC_LICENSE_KEY at run time.
FROM node:24-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY backend/server.js backend/pages.js backend/websocket.js backend/newrelic.js backend/dashboard-deeplink.js ./
COPY *.html *.js *.css site/
COPY images site/images
COPY favicons site/favicons
COPY data site/data
ENV NODE_ENV=production PORT=3000 SITE_ROOT=/app/site
EXPOSE 3000
USER node
CMD ["node", "server.js"]
