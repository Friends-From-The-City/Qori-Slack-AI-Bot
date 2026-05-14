FROM node:20-alpine

# Install build dependencies if needed
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (module-alias is needed at runtime)
# Note: We install dev deps too because some packages may need them
RUN npm ci --legacy-peer-deps

# Copy application code
COPY . .

# Build the project (Babel compiles .js and .ts from src/ to dist/)
RUN npm run build

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Health check (using node to check health endpoint)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Run the compiled app
CMD ["node", "./dist/app.js"]
