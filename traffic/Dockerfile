# Simulated visitors for the demo site. The Playwright image already has Chromium, Firefox and WebKit;
# its version must match the playwright package in package.json.
FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY simulate.js ./
USER pwuser
CMD ["node", "simulate.js"]
