FROM node:24-slim

# Install PostgreSQL client tools for pg_dump / pg_restore
RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY backup.js .

CMD ["node", "backup.js"]
