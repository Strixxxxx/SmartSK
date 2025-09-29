# ============================
# Stage 1: Build Node.js deps
# ============================
FROM node:22-bullseye-slim AS node-builder

WORKDIR /app

RUN node --version && npm --version

COPY package*.json ./
RUN echo "Installing Node.js dependencies..." && npm ci --omit=dev

# ============================
# Stage 2: Build Python deps
# ============================
FROM python:3.9-slim AS python-builder

WORKDIR /app

RUN python3 --version && pip --version

# Install build tools and ODBC development libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    unixodbc-dev \
    curl \
    gnupg2 \
    && rm -rf /var/lib/apt/lists/*

# Install Microsoft ODBC Driver 17 for SQL Server (build stage)
RUN curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && curl https://packages.microsoft.com/config/debian/11/prod.list > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql17 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN echo "Installing Python dependencies..." && pip install --no-cache-dir -r requirements.txt -t /python-packages

# ============================
# Final Stage: Runtime
# ============================
FROM node:22-bullseye-slim

WORKDIR /app

# Install Python + pip + ODBC runtime libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    unixodbc \
    curl \
    gnupg2 \
    && rm -rf /var/lib/apt/lists/*

# Install Microsoft ODBC Driver 17 for SQL Server (runtime)
RUN curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && curl https://packages.microsoft.com/config/debian/11/prod.list > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql17 \
    && rm -rf /var/lib/apt/lists/*

RUN echo "Final container build:" && node --version && npm --version && python3 --version && pip --version

# Copy node modules
COPY --from=node-builder /app/node_modules ./node_modules

# Copy python deps to the correct Python 3.9 path
COPY --from=python-builder /python-packages /usr/local/lib/python3.9/dist-packages

# Copy app source
COPY . .

EXPOSE 8080

CMD echo "Starting container with PORT=$PORT" && python3 -c "import sys; print('Python path:', sys.path)" && python3 -c "import pandas; print('Pandas version:', pandas.__version__)" && node --trace-warnings main.js