import os
import pandas as pd
import pyodbc
import logging

logger = logging.getLogger(__name__)

DB_SERVER = os.getenv("DB_SERVER")
DB_DATABASE = os.getenv("DB_DATABASE")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_DRIVER = os.getenv('DB_DRIVER')

import urllib
from sqlalchemy import create_engine, text

# --- Centralized DB Engine ---
# For Mssql + pyodbc, SQLAlchemy requires a specific connection string format
# format: mssql+pyodbc:///?odbc_connect={params}
params = urllib.parse.quote_plus(f'DRIVER={DB_DRIVER};SERVER={DB_SERVER};DATABASE={DB_DATABASE};UID={DB_USER};PWD={DB_PASSWORD}')
engine = create_engine(f"mssql+pyodbc:///?odbc_connect={params}")

def get_raw_data_from_db(category=None):
    """
    Fetches raw project data from the database using SQLAlchemy engine.
    """
    if not all([DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD]):
        raise Exception("Database credentials are not fully configured in environment variables.")
    
    try:
        logger.info("Connecting to the database via SQLAlchemy to fetch raw data.")
        
        query = "EXEC [Raw Data] @categoryFilter=:category"
        
        # Using engine.connect() with pandas to satisfy the connectable requirement
        with engine.connect() as conn:
            df = pd.read_sql(text(query), conn, params={"category": category} if category else {"category": None})
            
            logger.info(f"Successfully fetched {len(df)} rows from the database.")

            if df.empty:
                return []

            # The stored procedure already returns data in a wide format, which is what the
            # downstream scripts expect. No further processing is needed here.
            logger.info(f"Returning {len(df)} rows of raw data.")
            return df.to_dict('records')

    except Exception as e:
        logger.error("Failed to fetch or process data from database", exc_info=True)
        return []

def get_db_connection():
    """
    Returns a raw pyodbc connection object for manual cursor operations.
    Maintained for backward compatibility but prefers SQLAlchemy for Pandas.
    """
    return engine.raw_connection()

def get_barangay_abbr(barangay_id):
    """Maps barangay ID to abbreviation for filename conventions."""
    mapping = {1: 'SB', 2: 'NN'}
    return mapping.get(barangay_id, 'UNK')

def get_project_export_filename(batch_id):
    """
    Queries the database to construct the expected filename for a project batch in Azure,
    and also returns the actual project name for the download display.
    Returns: (blob_name, display_name)
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            query = "SELECT projType, targetYear, barangayID, projName FROM projectBatch WHERE batchID = ?"
            cursor.execute(query, batch_id)
            row = cursor.fetchone()
            if not row:
                return None, None
            
            proj_type, year, b_id, proj_name = row
            abbr = get_barangay_abbr(b_id)
            
            blob_name = f"{proj_type}_{abbr}_{year}.xlsx"
            display_name = proj_name if proj_name.endswith('.xlsx') else f"{proj_name}.xlsx"
            
            return blob_name, display_name
    except Exception as e:
        logger.error(f"Error looking up project filename for batch {batch_id}: {e}")
        return None, None

