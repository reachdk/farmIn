# Multi-stage build for Farm Attendance System
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    sqlite-dev \
    vips-dev \
    libc6-compat

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    sqlite \
    vips \
    dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S farmapp -u 1001

WORKDIR /app

# Copy built application
COPY --from=build --chown=farmapp:nodejs /app/dist ./dist
COPY --from=build --chown=farmapp:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=farmapp:nodejs /app/package.json ./package.json

# Create data directory
RUN mkdir -p /app/data && chown farmapp:nodejs /app/data
RUN mkdir -p /app/uploads && chown farmapp:nodejs /app/uploads
RUN mkdir -p /app/backups && chown farmapp:nodejs /app/backups

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/farm_attendance.db
ENV UPLOAD_PATH=/app/uploads
ENV BACKUP_PATH=/app/backups

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Switch to non-root user
USER farmapp

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]