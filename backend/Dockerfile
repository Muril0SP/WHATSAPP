FROM node:20-slim

RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN mkdir -p /app/data/sessions /app/data/storage

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
