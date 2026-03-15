import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta
import pandas as pd
from dotenv import load_dotenv
import io

from .forecast import generate_forecast_report
from storage.storage import download_blob_to_memory, upload_blob_from_memory, list_blobs, JSON_CONTAINER
from database.db_utils import get_db_connection

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==============================================================================
# Data Sourcing
# ==============================================================================

def get_data_from_sql():
    logger.info("Retrieving finalized ABYIP data from SQL database...")
    try:
        with get_db_connection() as conn:
            # Query targets ABYIP projects that have reached 'City Approval' (Status 6) or beyond.
            # Groups content by batch/year for accurate forecasting.
            query = """
            SELECT 
                pb.batchID,
                pb.projName,
                pb.targetYear,
                pa.PPA,
                pa.category,
                pa.total,
                pa.sheetRowIndex
            FROM projectBatch pb
            JOIN projectABYIP pa ON pb.batchID = pa.projbatchID
            CROSS APPLY (
                SELECT TOP 1 pt.statusID 
                FROM projectTracker pt 
                WHERE pt.batchID = pb.batchID 
                ORDER BY pt.updatedAt DESC
            ) latestStatus
            WHERE pb.projType = 'ABYIP' 
              AND latestStatus.statusID >= 6
            ORDER BY pb.targetYear DESC, pa.sheetRowIndex ASC;
            """
            df = pd.read_sql_query(query, conn)
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
# Data Standardization
# ==============================================================================

# --- Standardization Maps ---
# Based on the 10 Centers of Participation in the Philippine Youth Development Plan 2023-2028
CATEGORY_MAP = {
    # Health
    'CENTER OF PARTICIPATION: HEALTH': 'Health',
    'CENTER OF PARTICIPATION : HEALTH': 'Health',
    'HEALTH': 'Health',
    # Education
    'CENTER OF PARTICIPATION: EDUCATION': 'Education',
    'CENTER OF PARTICIPATION:  EDUCATION': 'Education',
    'EDUCATION': 'Education',
    # Economic Empowerment
    'CENTER OF PARTICIPATION: ECONOMIC EMPOWERMENT': 'Economic Empowerment',
    'ECONOMIC EMPOWERMENT': 'Economic Empowerment',
    # Social Inclusion
    'CENTER OF PARTICIPATION: SOCIAL INCLUSION & EQUITY': 'Social Inclusion',
    'SOCIAL, INCLUSION AND EQUITY': 'Social Inclusion',
    # Peace-building
    'CENTER OF PARTICIPATION: PEACE BUILDING & SECURITY': 'Peace-building',
    'PEACE-BUILDING AND SECURITY': 'Peace-building',
    # Governance
    'CENTER OF PARTICIPATION: GOVERNANCE': 'Governance',
    'GOVERNANCE': 'Governance',
    # Active Citizenship
    'CENTER OF PARTICIPATION: ACTIVE CITIZENSHIP': 'Active Citizenship',
    'ACTIVE CITEZENSHIP': 'Active Citizenship', # Correcting typo
    # Environment
    'CENTER OF PARTICIPATION:  ENVIRONMENT': 'Environment',
    'CENTER OF PARTICIPATION: ENVIRONMENT': 'Environment',
    'ENVIRONMENT': 'Environment',
    # Global Mobility
    'CENTER OF PARTICIPATION: GLOBAL MOBILITY': 'Global Mobility',
    # Agriculture
    'CENTER OF PARTICIPATION: AGRICULTURE': 'Agriculture',
    'AGRICULTURE': 'Agriculture',
    # Fallback/Admin
    'CENTER OF PARTICIPATION: GENERAL ADMINISTRATION PROGRAM': 'Governance' # Mapping to Governance
}

COMMITTEE_MAP = {
    # Anti-Drug Abuse
    'SK Chairman and Committee on Anti-Drug Abuse': 'Committee on Anti-Drug Abuse & Social Protection',
    'SK Committee on Anti-Drug Abuse and Social Protection': 'Committee on Anti-Drug Abuse & Social Protection',
    # Education
    'SK Chairman and SK Committee on Education': 'Committee on Education & Culture',
    'SK Committee on Education and Culture': 'Committee on Education & Culture',
    'SK CHAIRMAN AND SK Committee on Education': 'Committee on Education & Culture',
    # Environment
    'SK Chairman and SK Committee on Environment': 'Committee on Environmental Protection',
    'SK Committee on Environmental Protection': 'Committee on Environmental Protection',
    # Gender and Development
    'SK CHAIRMAN and SK Committee on Gender and Development': 'Committee on Gender & Development',
    'SK CHAIRMAN and SK Commitiee on Gender and Development': 'Committee on Gender & Development', # Typo
    'SK Committee on Gender and Development': 'Committee on Gender & Development',
    # Health
    'SK Chairman and SK Committee on Health': 'Committee on Health',
    'SK Committee on Health': 'Committee on Health',
    # Youth Employment
    'SK CHAIRMAN AND SK Committee on Youth Employment and Livelihood': 'Committee on Youth Employment & Livelihood',
    'SK Committee on Livelihood and Employment': 'Committee on Youth Employment & Livelihood',
    # Sports
    'SK Chairman and SK Committee on Sports': 'Committee on Sports Development',
    'SK Committee on Sports Development': 'Committee on Sports Development',
    # Youth Empowerment
    'SK Committee on Youth Empowerment': 'Committee on Youth Empowerment',
    # SK Council
    'SK COUNCIL': 'SK Council'
}

def standardize_data(df):
    """Cleans and standardizes the Category and Committee columns."""
    logger.info("Standardizing Category and Committee data...")
    if 'category' not in df.columns or 'committee' not in df.columns:
        logger.warning("'category' or 'committee' column not found. Skipping standardization.")
        return df

    # --- Standardize Category ---
    # Create a mapping for case-insensitive and space-insensitive matching
    category_lower_map = {k.strip().lower(): v for k, v in CATEGORY_MAP.items()}
    # Apply the map
    df['category'] = df['category'].str.strip().str.lower().map(category_lower_map).fillna(df['category'])

    # --- Standardize Committee ---
    # Clean up newlines and extra spaces before mapping
    committee_clean_map = {k.replace('\n', ' ').replace('  ', ' ').strip().lower(): v for k, v in COMMITTEE_MAP.items()}
    df['committee'] = df['committee'].str.replace('\n', ' ').str.replace('  ', ' ').str.strip().str.lower()\
        .map(committee_clean_map).fillna(df['committee'])

    # Log the results
    final_categories = df['category'].unique()
    final_committees = df['committee'].unique()
    logger.info(f"Standardization complete. Found {len(final_categories)} unique categories.")
    logger.info(f"Standardization complete. Found {len(final_committees)} unique committees.")

    return df

# ==============================================================================
# Main Orchestration Logic
# ==============================================================================

def main():
    """Main function to run the entire AI job orchestration."""
    logger.info("--- Starting AI Job Orchestration ---")
    
    # 1. Source Data from SQL (Single Source of Truth)
    master_df = get_data_from_sql()
    
    if master_df.empty:
        logger.critical("FATAL: No finalized ABYIP data found in SQL Database. Aborting job.")
        raise RuntimeError("No finalized ABYIP data found in SQL Database.")

    # 2. Normalize Column Names
    if 'Category' in master_df.columns and 'category' not in master_df.columns:
        logger.info("Normalizing column 'Category' to 'category'.")
        master_df.rename(columns={'Category': 'category'}, inplace=True)

    if 'Committee' in master_df.columns and 'committee' not in master_df.columns:
        logger.info("Normalizing column 'Committee' to 'committee'.")
        master_df.rename(columns={'Committee': 'committee'}, inplace=True)

    # 3. Standardize Data (NEW STEP)
    master_df = standardize_data(master_df)

    # 4. Reshape Data from Wide to Long Format
    logger.info("Reshaping data from wide to long format...")
    try:
        id_vars = ['PPA', 'category', 'committee']
        id_vars = [col for col in id_vars if col in master_df.columns]
        
        melted_df = master_df.melt(
            id_vars=id_vars,
            var_name='metric_year',
            value_name='value'
        )

        melted_df.dropna(subset=['value'], inplace=True)
        melted_df = melted_df[melted_df['value'] != '']

        melted_df['year'] = melted_df['metric_year'].str.extract(r'(\d{4})')
        melted_df['metric_type'] = melted_df['metric_year'].str.extract(r'([A-Za-z]+)')[0].str.lower()
        
        melted_df.dropna(subset=['year'], inplace=True)
        melted_df['year'] = melted_df['year'].astype(int)

        melted_df['value'] = pd.to_numeric(melted_df['value'].astype(str).str.replace(',', ''), errors='coerce')
        
        long_df = melted_df.pivot_table(
            index=id_vars + ['year'],
            columns='metric_type',
            values='value',
            aggfunc='first'
        ).reset_index()

        long_df['start_date'] = pd.to_datetime(long_df['year'].astype(str) + '-01-01')
        
        master_df = long_df
        logger.info(f"Data successfully reshaped. Resulting DataFrame has {len(master_df)} rows.")
    except Exception as e:
        logger.error(f"Failed to reshape data: {e}", exc_info=True)
        # Raise exception if reshaping fails, as downstream modules will not work
        raise RuntimeError(f"Failed to reshape data: {e}")

    # Convert date columns for filtering
    if 'start_date' in master_df.columns:
        master_df['start_date'] = pd.to_datetime(master_df['start_date'], errors='coerce')

    # 5. Discover Standardized Categories
    unique_categories = sorted([cat for cat in master_df['category'].unique() if pd.notna(cat)])
    logger.info(f"Discovered {len(unique_categories)} standardized categories: {unique_categories}")

    # 6. Initialize Master Reports
    master_forecast = {}
    master_trends = {}
    master_analysis = {}

    # Get the Gemini API key once
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        logger.critical("FATAL: GEMINI_API_KEY not found in environment variables. Aborting job.")
        raise RuntimeError("GEMINI_API_KEY not found in environment variables.")

    # 7. Generate Reports

    # --- 7.1. Forecast Report ---
    logger.info("--- Generating Forecast Report ---")
    master_forecast = generate_forecast_report(master_df, gemini_api_key)
    if master_forecast.get("by_committee", {}).get("analysis", {}).get("error") or \
       master_forecast.get("by_category", {}).get("analysis", {}).get("error"):
        logger.critical("FATAL: Failed to generate forecast analysis after model fallback. Aborting job.")
        raise RuntimeError("Failed to generate forecast analysis after model fallback.")

    # --- 7.2. Trends Report ---
    logger.info("--- Generating Trends Reports ---")
    # General Trends
    master_trends['General'] = generate_trends_report(master_df, gemini_api_key, category='General')
    if master_trends['General'].get("error"):
        logger.critical("FATAL: Failed to generate General trends report after 5 attempts. Aborting job.")
        raise RuntimeError("Failed to generate General trends report after 5 attempts.")

    # Category-Specific Trends
    for category in unique_categories:
        logger.info(f"Generating trends for category: {category}")
        master_trends[category] = generate_trends_report(master_df, gemini_api_key, category=category)
        if master_trends[category].get("error"):
            logger.critical(f"FATAL: Failed to generate trends for category '{category}' after 5 attempts. Aborting job.")
            raise RuntimeError(f"Failed to generate trends for category '{category}' after 5 attempts.")

    # --- 7.3. Predictive Analysis Report ---
    logger.info("--- Generating Predictive Analysis Reports ---")
    quarters = ['Q1', 'Q2', 'Q3', 'Q4']
    months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    
    # General
    result = generate_project_analysis(master_df, gemini_api_key)
    if result.get("error"):
        logger.critical(f"FATAL: Failed to generate general analysis after 5 attempts. Aborting job.")
        raise RuntimeError("Failed to generate general analysis after 5 attempts.")
    master_analysis['general'] = result

    # Category-Only
    for category in unique_categories:
        filters = {'category': category}
        result = generate_project_analysis(master_df, gemini_api_key, filters=filters)
        if result.get("error"):
            logger.critical(f"FATAL: Failed to generate analysis for filters {filters} after 5 attempts. Aborting job.")
            raise RuntimeError(f"Failed to generate analysis for filters {filters} after 5 attempts.")
        master_analysis[f'category_{category.lower()}'] = result



    # 8. Upload Master Reports
    logger.info("--- Uploading Master Reports to Azure Storage ---")
    try:
        upload_master_report("forecast.json", master_forecast)
        upload_master_report("pa_trends.json", master_trends)
        upload_master_report("pa_analysis.json", master_analysis)
    except Exception as e:
        logger.critical(f"FATAL: Failed to upload one or more master reports. Error: {e}")
        raise RuntimeError(f"Failed to upload one or more master reports. Error: {e}")

    logger.info("--- AI Job Orchestration Completed Successfully ---")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.critical(f"An unhandled fatal error occurred during the AI job: {e}", exc_info=True)
        # When run directly, we can exit
        sys.exit(1)
