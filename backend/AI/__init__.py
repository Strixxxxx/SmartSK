# This file makes the AI directory a Python package
# It helps with importing modules from this directory

import os
import sys

# Add the package directory to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
packages_dir = os.path.join(current_dir, 'python_packages')

# Prepend the packages directory to the path to ensure it's checked first
if packages_dir not in sys.path:
    sys.path.insert(0, packages_dir)

# Add the current directory to the Python path for local module imports
if current_dir not in sys.path:
    sys.path.append(current_dir)

# Add the parent directory to the Python path
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

print("INFO: AI package initialized with custom package path.")