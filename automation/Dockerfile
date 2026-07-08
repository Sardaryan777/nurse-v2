# ── Automation worker: Puppeteer with its OWN matched Chromium ───────────────
FROM node:20-slim
WORKDIR /app

# Install the system libraries + fonts Chromium needs at runtime. We keep the
# `chromium` apt package too because it pulls in the full set of shared-library
# dependencies, but Puppeteer will download and run its OWN version-matched
# Chromium (more reliable than driving the system one).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    fonts-dejavu \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    fonts-noto-core \
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

# Let Puppeteer download its own matched Chromium during npm install.
# (No PUPPETEER_SKIP_DOWNLOAD / PUPPETEER_EXECUTABLE_PATH, so it uses the bundled one.)
COPY package.json ./
RUN npm install --omit=dev
COPY . .

CMD ["node", "automation.js"]
