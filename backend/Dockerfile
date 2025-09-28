```dockerfile
# ============================
# Stage 1: Build Python 3.12.9
# ============================
FROM debian:bullseye-slim AS python-builder

RUN apt-get update && \
    apt-get install -y wget build-essential libssl-dev zlib1g-dev \
                       libncurses5-dev libffi-dev libsqlite3-dev \
                       libbz2-dev libreadline-dev liblzma-dev && \
    wget https://www.python.org/ftp/python/3.12.9/Python-3.12.9.tgz && \
    tar xvf Python-3.12.9.tgz && \
    cd Python-3.12.9 && \
    ./configure --enable-optimizations && \
    make -j$(nproc) && \
    make altinstall && \
    cd .. && rm -rf Python-3.12.9*

# ============================
# Stage 2: Runtime (Node + Python)
# ============================
FROM node:22-bullseye-slim

# Install minimal runtime dependencies for Python
RUN apt-get update && \
    apt-get install -y libssl1.1 zlib1g libncurses5 libffi7 libsqlite3-0 \
                       libbz2-1.0 libreadline8 liblzma5 && \
    rm -rf /var/lib/apt/lists/*

# Copy Python binaries from builder
COPY --from=python-builder /usr/local/bin/python3.12 /usr/local/bin/python3.12
COPY --from=python-builder /usr/local/bin/pip3.12 /usr/local/bin/pip3.12
COPY --from=python-builder /usr/local/lib/python3.12 /usr/local/lib/python3.12

# Set aliases
RUN ln -s /usr/local/bin/python3.12 /usr/bin/python && \
    ln -s /usr/local/bin/pip3.12 /usr/bin/pip && \
    pip install --upgrade pip

# Set work directory
WORKDIR /usr/src/app

# Copy Node.js package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy Python requirements and install them
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose Azure expected port
EXPOSE 8080

# Run Node.js app
CMD ["npm", "start"]
```
