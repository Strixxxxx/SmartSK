#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "--- Custom Startup Script Started ---"

# Define the path for the virtual environment
VENV_PATH="/home/site/wwwroot/antenv"

# Check if python3 is available
if ! command -v python3 &> /dev/null
then
    echo "Python3 could not be found, exiting."
    exit 1
fi

echo "Python version: $(python3 --version)"

# Create a virtual environment if it doesn't exist
if [ ! -d "$VENV_PATH" ]; then
    echo "Creating Python virtual environment at $VENV_PATH..."
    python3 -m venv $VENV_PATH
    echo "Virtual environment created."
fi

# Activate the virtual environment
echo "Activating virtual environment..."
source $VENV_PATH/bin/activate

# Upgrade pip within the virtual environment
echo "Upgrading pip..."
pip install --upgrade pip --quiet

# Install dependencies from requirements.txt into the virtual environment
if [ -f "requirements.txt" ]; then
    echo "Found requirements.txt. Installing dependencies into venv..."
    pip install -r requirements.txt --quiet
    echo "Python dependencies installed successfully."
else
    echo "Warning: requirements.txt not found. Skipping Python dependency installation."
fi

# Verify Python packages are accessible within the venv
echo "Verifying Python package installation..."
python -c "import sys; print('Python executable:', sys.executable); print('Python path:', sys.path)" || echo "Warning: Python path check failed"

# The PATH is now correctly set by the venv activation to be inherited by the Node.js process.

# Start the Node.js application
echo "Starting Node.js application with 'npm start'..."
npm start

echo "--- Custom Startup Script Finished ---"
