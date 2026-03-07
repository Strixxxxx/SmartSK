# ============================
# Stage 1: Build Node.js deps
# ============================
FROM node:22-bullseye-slim AS node-builder

WORKDIR /app

RUN node --version && npm --version

COPY package*.json ./
RUN echo "Installing Node.js dependencies..." && npm ci --omit=dev

# ============================
# Final Stage: Runtime
# ============================
FROM node:22-bullseye-slim

WORKDIR /app

# Install runtime dependencies: curl, gnupg2, ffmpeg, unzip, p7zip-full, libicu67, libunwind8 (for sqlpackage)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg2 \
    ffmpeg \
    unzip \
    p7zip-full \
    libicu67 \
    libunwind8 \
    && rm -rf /var/lib/apt/lists/*

# Install sqlpackage
RUN curl -L -o /tmp/sqlpackage.zip "https://aka.ms/sqlpackage-linux" \
    && unzip /tmp/sqlpackage.zip -d /opt/sqlpackage \
    && chmod +x /opt/sqlpackage/sqlpackage \
    && rm /tmp/sqlpackage.zip

# Add sqlpackage to PATH
ENV PATH="/opt/sqlpackage:${PATH}"

RUN echo "Final container build (Node.js only):" && node --version && npm --version && sqlpackage /?

# Copy node modules from builder
COPY --from=node-builder /app/node_modules ./node_modules

# Copy app source
COPY . .

EXPOSE 8000
CMD ["/bin/sh", "-c", "node --trace-warnings main.js 2>&1"]
