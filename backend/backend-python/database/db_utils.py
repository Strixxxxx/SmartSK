import os
import pandas as pd
import pyodbc
import logging

logger = logging.getLogger(__name__)

DB_SERVER = os.getenv("DB_SERVER")
DB_DATABASE = os.getenv("DB_DATABASE")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
# For Linux, the driver name is often just 'ODBC Driver 17 for SQL Server'
# but it can vary depending on the installation. Using an env var is more robust.
DB_DRIVER = os.getenv('DB_DRIVER', '{ODBC Driver 17 for SQL Server}')

def get_raw_data_from_db(category=None):
    """
    Fetches raw project data from the database and returns it as a list of dictionaries.
    """
    if not all([DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD]):
        raise Exception("Database credentials are not fully configured in environment variables.")
    
    conn_str = f'DRIVER={DB_DRIVER};SERVER={DB_SERVER};DATABASE={DB_DATABASE};UID={DB_USER};PWD={DB_PASSWORD}'
    
    try:
        with pyodbc.connect(conn_str) as conn:
            logger.info("Connecting to the database to fetch raw data.")
            
            query = "EXEC [Raw Data] @categoryFilter=?"
            params = (category,) if category else (None,)
            
            df = pd.read_sql(query, conn, params=params)
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
