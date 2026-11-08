FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN npm run build:locker \
    && mkdir -p data/files uploads temp \
    && chown -R node:node /app

ENV NODE_ENV=production

EXPOSE 10000

USER node

CMD ["npm", "start"]