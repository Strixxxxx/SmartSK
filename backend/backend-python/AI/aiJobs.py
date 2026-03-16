import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta
import pandas as pd
from dotenv import load_dotenv
import io

from .forecast import generate_forecast_report
from .pa_logic import generate_project_analysis
from .trends_logic import generate_trends_report
from storage.storage import download_blob_to_memory, upload_blob_from_memory, list_blobs, JSON_CONTAINER
from database.db_utils import get_db_connection, engine
from sqlalchemy import text

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==============================================================================
# Data Sourcing
# ==============================================================================

def get_data_from_sql():
    """
    Fetches finalized ABYIP data from SQL Server using SQLAlchemy to avoid Pandas warnings.
    """
    logger.info("Retrieving finalized ABYIP data from SQL database...")
    query = """
    SELECT 
        pb.batchID,
        pb.projName,
        pb.targetYear,
        pa.PPA,
        pa.centerOfParticipation AS category,
        pa.personResponsible AS committee,
        pa.total,
        pa.sheetRowIndex
    FROM projectBatch pb
    INNER JOIN projectABYIP pa ON pb.batchID = pa.projbatchID
    INNER JOIN (
        SELECT batchID, MAX(statusID) as maxStatus
        FROM projectTracker
        GROUP BY batchID
    ) tracker ON pb.batchID = tracker.batchID
    WHERE pb.projType = 'ABYIP' 
      AND tracker.maxStatus >= 6
    ORDER BY pb.targetYear DESC, pa.sheetRowIndex ASC;
    """
    try:
        with engine.connect() as conn:
            df = pd.read_sql(text(query), conn)
            logger.info(f"Successfully fetched {len(df)} finalized ABYIP rows from SQL database.")
            return df
    except Exception as e:
        logger.error(f"Error fetching data from SQL: {e}", exc_info=True)
        return pd.DataFrame()

# ==============================================================================
# Report Upload
# ==============================================================================

def upload_master_report(report_name, report_data):
    """Uploads a master report dictionary as a single JSON file to Azure Blob Storage."""
    logger.info(f"Uploading master report '{report_name}' to Azure Storage...")
    if not JSON_CONTAINER:
        raise ConnectionError("Azure storage configuration for report upload is missing (JSON_CONTAINER).")

    try:
        report_json = json.dumps(report_data, indent=2)
        success = upload_blob_from_memory(JSON_CONTAINER, report_name, report_json.encode('utf-8'))
        
        if success:
            logger.info(f"Successfully uploaded {report_name} to Azure container '{JSON_CONTAINER}'.")
        else:
            raise Exception(f"Failed to upload {report_name} to Azure.")

    except Exception as e:
        logger.error(f"Error uploading report {report_name} to Azure storage: {e}", exc_info=True)
        raise

# ==============================================================================
# Helper for Category Standardization
# ==============================================================================

def standardize_data(df):
    """
    Standardizes 'category' (centerOfParticipation) and 'committee' (personResponsible)
    to handle variations in naming.
    """
    if 'category' in df.columns:
        df['category'] = df['category'].fillna('General Administration Program')
        df['category'] = df['category'].replace(['', 'N/A', 'None'], 'General Administration Program')
        
    if 'committee' in df.columns:
        df['committee'] = df['committee'].fillna('SK Council')
    
    return df

# ==============================================================================
# Orchestrator
# ==============================================================================

def main():
    """
    The main orchestration function for the AI Job.
    1. Fetches data from SQL.
    2. Standardizes data.
    3. Handles long-format processing.
    4. Computes Forecasts.
    5. Computes Trends.
    6. Computes Predictive Analysis.
    7. Creates master reports and uploads them to Azure.
    """
    
    # Load environment variables if run directly
    load_dotenv()
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        logger.error("FATAL: GEMINI_API_KEY environment variable not set.")
        raise ValueError("GEMINI_API_KEY is missing.")

    logger.info("--- Starting AI Job Orchestration ---")
    
    # 1. Source Data from SQL (Single Source of Truth)
    logger.info("[Step 1] Fetching data from SQL...")
    master_df = get_data_from_sql()
    
    if master_df.empty:
        logger.critical("FATAL: No finalized ABYIP data found in SQL Database. Aborting job.")
        raise RuntimeError("No finalized ABYIP data found in SQL Database.")
    logger.info(f"Successfully retrieved {len(master_df)} rows for analysis.")

    # 3. Standardize Data
    logger.info("[Step 2] Standardizing Data (Categories and Committees)...")
    master_df = standardize_data(master_df)

    # 4. Handle SQL Format (Long Format)
    logger.info("[Step 3] Processing SQL data for analysis (Mapping 'total' to 'budget')...")
    try:
        # Map 'total' to 'budget' as requested to maintain compatibility
        if 'total' in master_df.columns:
            master_df.rename(columns={'total': 'budget'}, inplace=True)
            logger.info("Mapped 'total' column to 'budget'.")

        # Extract year from targetYear (e.g. '2024')
        master_df['year'] = master_df['targetYear'].str.extract(r'(\d{4})')
        master_df.dropna(subset=['year'], inplace=True)
        master_df['year'] = master_df['year'].astype(int)

        # Ensure numeric values
        master_df['budget'] = pd.to_numeric(master_df['budget'], errors='coerce').fillna(0)
        
        # Downstream logic expects these columns to exist
        if 'ps' not in master_df.columns: master_df['ps'] = 0
        if 'mooe' not in master_df.columns: master_df['mooe'] = 0
        if 'co' not in master_df.columns: master_df['co'] = 0
            
        master_df['start_date'] = pd.to_datetime(master_df['year'].astype(str) + '-01-01')
        
        logger.info(f"Data successfully processed. Ready for AI logic. {len(master_df)} rows.")
    except Exception as e:
        logger.error(f"Failed to process SQL data: {e}", exc_info=True)
        raise RuntimeError(f"Failed to process SQL data: {e}")

    # 5. Extract Unique Identifiers for Multi-Report Generation
    unique_categories = master_df['category'].unique().tolist()
    
    # Containers for final JSON structures
    master_forecast = {}
    master_trends = {}
    master_analysis = {}

    # --- 7.1. Forecast Report ---
    logger.info("[Step 4] Starting Full Forecast Analysis...")
    master_forecast = generate_forecast_report(master_df, gemini_api_key)
    if not master_forecast:
        logger.critical("FATAL: Failed to generate forecast analysis. Aborting job.")
        raise RuntimeError("Failed to generate forecast analysis.")

    # --- 7.2. Trends Report ---
    logger.info("[Step 5] Starting Project Trends Analysis...")
    # General Trends
    logger.info("  > Requesting 'General' trends analysis...")
    master_trends['General'] = generate_trends_report(master_df, gemini_api_key, category='General')
    if master_trends['General'].get("error"):
        logger.warning("Failed to generate General trends. Skipping but continuing with others.")

    # Category-Specific Trends
    logger.info(f"  > Discovered categories: {unique_categories}")
    for category in unique_categories:
        logger.info(f"  > Requesting trends for category: '{category}'...")
        master_trends[category] = generate_trends_report(master_df, gemini_api_key, category=category)
        if master_trends[category].get("error"):
            logger.warning(f"    ! Failed to generate trends for '{category}'. Skipping.")
            continue

    # --- 7.3. Predictive Analysis Report ---
    logger.info("[Step 6] Starting Predictive Analysis Reports (Gemini + LSTM)...")
    
    # General
    logger.info("  > Requesting 'General' predictive analysis...")
    result = generate_project_analysis(master_df, gemini_api_key)
    if result.get("error"):
        logger.warning("Failed to generate general analysis. Skipping.")
    else:
        master_analysis['general'] = result

    # Category-Only
    for category in unique_categories:
        logger.info(f"  > Requesting analysis for category: '{category}'...")
        filters = {'category': category}
        result = generate_project_analysis(master_df, gemini_api_key, filters=filters)
        if result.get("error"):
            logger.warning(f"    ! Failed to generate analysis for filters {filters}. Skipping.")
            continue
        master_analysis[f'category_{category.lower()}'] = result

    # 8. Upload Master Reports
    logger.info("[Step 7] Uploading Master Reports to Azure Storage...")
    try:
        upload_master_report("forecast.json", master_forecast)
        upload_master_report("pa_trends.json", master_trends)
        upload_master_report("pa_analysis.json", master_analysis)
        logger.info("Successfully uploaded all master reports (forecast, trends, analysis).")
    except Exception as e:
        logger.critical(f"FATAL: Failed to upload master reports. Error: {e}")
        raise RuntimeError(f"Failed to upload master reports. Error: {e}")

    logger.info("--- AI Job Orchestration Completed Successfully ---")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.critical(f"An unhandled fatal error occurred during the AI job: {e}", exc_info=True)
        # When run directly, we can exit
        sys.exit(1)
