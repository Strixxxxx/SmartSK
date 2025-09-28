# ============================
# Stage 1: Build Node.js deps
# ============================
FROM node:22-bullseye-slim AS node-builder

WORKDIR /app

# Debug: show Node version
RUN node --version && npm --version

COPY backend/package*.json ./
RUN echo "Installing Node.js dependencies..." && npm ci --omit=dev

# ============================
# Stage 2: Build Python deps
# ============================
FROM python:3.12-slim AS python-builder

WORKDIR /app

# Debug: show Python version
RUN python3 --version && pip --version

# Install build tools
RUN apt-get update && apt-get install -y --no-install-recommends build-essential gcc && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN echo "Installing Python dependencies..." && pip install --no-cache-dir -r requirements.txt -t /python-packages

# ============================
# Final Stage: Runtime
# ============================
FROM node:22-bullseye-slim

WORKDIR /app

# Install Python + pip
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/*

# Debug: confirm versions
RUN echo "Final container build:" && node --version && npm --version && python3 --version && pip --version

# Copy node modules
COPY --from=node-builder /app/node_modules ./node_modules

# Copy python deps
COPY --from=python-builder /python-packages /usr/local/lib/python3.12/site-packages

# Copy app source
COPY backend/ .

# Expose Azure port
EXPOSE 8080

# Debug: print environment on container start
CMD echo "Starting container with PORT=$PORT" && env && node --trace-warnings main.js
