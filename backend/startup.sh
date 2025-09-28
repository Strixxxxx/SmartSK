#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "--- Custom Startup Script Started ---"

# Check if python3 is available
if ! command -v python3 &> /dev/null
then
    echo "Python3 could not be found, exiting."
    exit 1
fi

echo "Python version: $(python3 --version)"

# Add the user's local bin directory to the PATH for this script's execution and for the node app
# This ensures that pip and any installed packages are available.
export PATH="$HOME/.local/bin:$PATH"

# Install pip if it's not already installed
if ! python3 -m pip --version &> /dev/null
then
    echo "pip not found. Installing pip..."
    # Use curl to download get-pip.py and then execute it with python3
    # The --user flag installs pip to the user's local directory, avoiding permission issues.
    curl -sS https://bootstrap.pypa.io/get-pip.py | python3 - --user
    echo "pip installed successfully."
else
    echo "pip is already installed."
fi

# Upgrade pip to the latest version
echo "Upgrading pip..."
python3 -m pip install --upgrade pip --user --quiet

# Verify pip is now available
if ! python3 -m pip --version &> /dev/null
then
    echo "FATAL: pip is not available after installation attempt. Exiting."
    exit 1
fi

# Install dependencies from requirements.txt
if [ -f "requirements.txt" ]; then
    echo "Found requirements.txt. Installing dependencies..."
    # The --user flag ensures packages are installed in the user's local site-packages directory.
    python3 -m pip install -r requirements.txt --user --quiet
    echo "Python dependencies installed successfully."
else
    echo "Warning: requirements.txt not found. Skipping Python dependency installation."
fi

# Verify Python packages are accessible
echo "Verifying Python package installation..."
python3 -c "import sys; print('Python path:', sys.path)" || echo "Warning: Python path check failed"

# Start the Node.js application
echo "Starting Node.js application with 'npm start'..."
npm start

echo "--- Custom Startup Script Finished ---"
