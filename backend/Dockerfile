FROM node:22-lts

# Install Python and system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Copy Python requirements first (for better Docker layer caching)
COPY requirements.txt ./
COPY runtime.txt ./

# Create and activate Python virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy package.json and package-lock.json (for better Docker layer caching)
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Set environment variables
ENV PORT=3000
ENV PYTHONPATH="/opt/venv/lib/python3.11/site-packages"

# Expose the port
EXPOSE 3000

# Start the application directly with Node.js (no need for startup.sh)
CMD ["npm", "start"]