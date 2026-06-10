# ── Automation worker: Node + system Chromium for Puppeteer ──────────────────
FROM node:20-slim
WORKDIR /app

# Install Chromium and the libraries Puppeteer needs to run it headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    fonts-dejavu \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    fonts-noto-color-emoji \
    libnss3 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
  && rm -rf /var/lib/apt/lists/*

# Use the system Chromium; skip Puppeteer's bundled download.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json ./
RUN npm install --omit=dev
COPY . .

CMD ["node", "automation.js"]
