import os
import sys

def setup_paths():
    """
    Adds the 'python_packages' directory to the Python path.
    This ensures that modules installed in this custom directory can be imported
    when scripts are run as standalone processes.
    """
    # The directory containing this script (and all other AI scripts)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    packages_dir = os.path.join(current_dir, 'python_packages')

    if packages_dir not in sys.path:
        sys.path.insert(0, packages_dir)