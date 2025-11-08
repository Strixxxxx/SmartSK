import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta
import pandas as pd
from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv
import io

# --- Import Refactored Logic Modules ---
from .pa_logic import generate_project_analysis
from .trends_logic import generate_trends_report
from .forecast import generate_forecast_report

# ==============================================================================
# Configuration
# ==============================================================================

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables explicitly from the backend directory
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=dotenv_path)
logger.info(f"Attempting to load .env file from: {os.path.abspath(dotenv_path)}")

# --- Azure and Database Credentials ---
AZURE_STORAGE_CONNECTION_STRING = (
    os.getenv("STORAGE_CONNECTION_STRING_1") or
    os.getenv("STORAGE_KEY_1") or
    os.getenv("STORAGE_CONNECTION_STRING_2") or
    os.getenv("STORAGE_KEY_2")
)
HA_CONTAINER_NAME = os.getenv("HA_CONTAINER")
JSON_CONTAINER_NAME = os.getenv("JSON_CONTAINER")

DB_SERVER = os.getenv('DB_SERVER')
DB_DATABASE = os.getenv('DB_DATABASE')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_DRIVER = os.getenv('DB_DRIVER', '{ODBC Driver 17 for SQL Server}')
DB_CONN_STR = f'DRIVER={DB_DRIVER};SERVER={DB_SERVER};DATABASE={DB_DATABASE};UID={DB_USER};PWD={DB_PASSWORD}'

# ==============================================================================
# Data Sourcing
# ==============================================================================

def get_data_from_azure():
    """Fetches all CSVs from the historical archive and merges them into a single DataFrame."""
    logger.info("Attempting to fetch data from Azure Blob Storage...")
    if not all([AZURE_STORAGE_CONNECTION_STRING, HA_CONTAINER_NAME]):
        logger.error("Azure configuration for data sourcing is missing.")
        return pd.DataFrame()

    try:
        blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
        container_client = blob_service_client.get_container_client(HA_CONTAINER_NAME)

        all_dfs = []
        for blob in container_client.list_blobs():
            if blob.name.lower().endswith('.csv'):
                logger.info(f"Downloading and parsing {blob.name}...")
                blob_client = container_client.get_blob_client(blob)
                downloader = blob_client.download_blob()
                stream = io.StringIO(downloader.readall().decode('utf-8'))
                df = pd.read_csv(stream)
                all_dfs.append(df)
        
        if not all_dfs:
            logger.warning("No CSV files found in Azure container.")
            return pd.DataFrame()

        master_df = pd.concat(all_dfs, ignore_index=True)
        logger.info(f"Successfully merged {len(all_dfs)} files from Azure into a DataFrame with {len(master_df)} rows.")
        return master_df

    except Exception as e:
        logger.error(f"Error fetching data from Azure: {e}", exc_info=True)
        return pd.DataFrame()

def get_data_from_sql():
    """Executes the [Raw Data] stored procedure as a fallback."""
    logger.info("Attempting to fetch data from SQL database as fallback...")
    try:
        import pyodbc
        with pyodbc.connect(DB_CONN_STR) as conn:
            query = "EXEC [Raw Data]"
            df = pd.read_sql_query(query, conn)
            logger.info(f"Successfully fetched {len(df)} rows from SQL database.")
            return df
    except Exception as e:
        logger.error(f"Error fetching data from SQL: {e}", exc_info=True)
        return pd.DataFrame()

# ==============================================================================
# Report Upload
# ==============================================================================

def upload_master_report(report_name, report_data):
    """Uploads a master report dictionary as a single JSON file to Azure."""
    logger.info(f"Uploading master report '{report_name}' to Azure...")
    if not all([AZURE_STORAGE_CONNECTION_STRING, JSON_CONTAINER_NAME]):
        raise ConnectionError("Azure configuration for report upload is missing.")

    try:
        blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
        container_client = blob_service_client.get_container_client(JSON_CONTAINER_NAME)
        
        report_json = json.dumps(report_data, indent=2)
        blob_client = container_client.get_blob_client(report_name)
        blob_client.upload_blob(report_json, overwrite=True)
        logger.info(f"Successfully uploaded {report_name}.")

    except Exception as e:
        logger.error(f"Error uploading report {report_name} to Azure: {e}", exc_info=True)
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
    logger.info("--- Starting Hourly AI Job Orchestration ---")
    
    # 1. Source Data
    master_df = get_data_from_azure()
    if master_df.empty:
        logger.warning("Azure data source was empty or failed. Falling back to SQL.")
        master_df = get_data_from_sql()
    
    if master_df.empty:
        logger.critical("FATAL: No data could be sourced from Azure or SQL. Aborting job.")
        sys.exit(1)

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
        # Exit if reshaping fails, as downstream modules will not work
        sys.exit(1)

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
        sys.exit(1)

    # 7. Generate Reports

    # --- 7.1. Forecast Report ---
    logger.info("--- Generating Forecast Report ---")
    master_forecast = generate_forecast_report(master_df, gemini_api_key)
    if master_forecast.get("by_committee", {}).get("analysis", {}).get("error") or \
       master_forecast.get("by_category", {}).get("analysis", {}).get("error"):
        logger.critical("FATAL: Failed to generate forecast analysis after 5 attempts. Aborting job.")
        sys.exit(1)

    # --- 7.2. Trends Report ---
    logger.info("--- Generating Trends Reports ---")
    # General Trends
    master_trends['General'] = generate_trends_report(master_df, gemini_api_key, category='General')
    if master_trends['General'].get("error"):
        logger.critical("FATAL: Failed to generate General trends report after 5 attempts. Aborting job.")
        sys.exit(1)

    # Category-Specific Trends
    for category in unique_categories:
        logger.info(f"Generating trends for category: {category}")
        master_trends[category] = generate_trends_report(master_df, gemini_api_key, category=category)
        if master_trends[category].get("error"):
            logger.critical(f"FATAL: Failed to generate trends for category '{category}' after 5 attempts. Aborting job.")
            sys.exit(1)

    # --- 7.3. Predictive Analysis Report ---
    logger.info("--- Generating Predictive Analysis Reports ---")
    quarters = ['Q1', 'Q2', 'Q3', 'Q4']
    months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    
    # General
    result = generate_project_analysis(master_df, gemini_api_key)
    if result.get("error"):
        logger.critical(f"FATAL: Failed to generate general analysis after 5 attempts. Aborting job.")
        sys.exit(1)
    master_analysis['general'] = result

    # Category-Only
    for category in unique_categories:
        filters = {'category': category}
        result = generate_project_analysis(master_df, gemini_api_key, filters=filters)
        if result.get("error"):
            logger.critical(f"FATAL: Failed to generate analysis for filters {filters} after 5 attempts. Aborting job.")
            sys.exit(1)
        master_analysis[f'category_{category.lower()}'] = result



    # 8. Upload Master Reports
    logger.info("--- Uploading Master Reports to Azure ---")
    try:
        upload_master_report("forecast.json", master_forecast)
        upload_master_report("pa_trends.json", master_trends)
        upload_master_report("pa_analysis.json", master_analysis)
    except Exception as e:
        logger.critical(f"FATAL: Failed to upload one or more master reports. Error: {e}")
        sys.exit(1)

    logger.info("--- Hourly AI Job Orchestration Completed Successfully ---")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.critical(f"An unhandled fatal error occurred during the AI job: {e}", exc_info=True)
        sys.exit(1)
