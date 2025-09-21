import os
import sys
import json
import argparse
import logging
from datetime import datetime
import pandas as pd
import numpy as np
import pyodbc

try:
    import google.generativeai as genai
    gemini_available = True
except ImportError:
    gemini_available = False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
DB_SERVER = os.getenv("DB_SERVER")
DB_DATABASE = os.getenv("DB_DATABASE")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_DRIVER = '{ODBC Driver 17 for SQL Server}'
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def get_database_data():
    """Fetches data from the database by executing the [Raw Data] stored procedure."""
    logger.info("Step 1/5: Connecting to database...")
    if not all([DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD]):
        raise Exception("Database credentials are not fully configured in environment variables.")
    
    conn_str = f'DRIVER={DB_DRIVER};SERVER={DB_SERVER};DATABASE={DB_DATABASE};UID={DB_USER};PWD={DB_PASSWORD}'
    
    try:
        with pyodbc.connect(conn_str) as conn:
            logger.info("Successfully connected to the database.")
            query = "EXEC [Raw Data]"
            df = pd.read_sql(query, conn)
            logger.info(f"Step 1/5: Successfully fetched {len(df)} rows from the database.")
            if df.empty:
                raise Exception("No data returned from the database.")
            return df
    except Exception as e:
        raise Exception(f"Failed to fetch data from database: {e}")

def process_db_data(df):
    """Processes the DataFrame from the database."""
    logger.info("Step 2/5: Processing database data...")
    if df.empty:
        raise Exception("No data to process.")
    
    budget_cols = [col for col in df.columns if 'budget' in col.lower()]
    if not budget_cols:
        raise Exception("No budget-related columns found in the data from the database.")

    for col in budget_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    df.dropna(subset=budget_cols, how='all', inplace=True)
    df.fillna(0, inplace=True)

    if df.empty:
        raise Exception("No valid budget data found after processing")

    logger.info(f"Step 2/5: Processed {len(df)} rows with valid budget data.")
    return df

def generate_chart_data(df, group_by_col):
    """
    Generates structured data for a stacked bar chart using pandas.
    """
    if group_by_col not in df.columns:
        logger.warning(f"Grouping column '{group_by_col}' not found. Skipping.")
        return None

    budget_cols = sorted([col for col in df.columns if 'budget' in col.lower()])
    years = [col.split('_')[0] for col in budget_cols]
    
    grouped_df = df.groupby(group_by_col)[budget_cols].sum()
    groups = grouped_df.index.tolist()

    budget_data = []
    for year, budget_col in zip(years, budget_cols):
        year_data_list = []
        for group in groups:
            budget_value = grouped_df.loc[group, budget_col]
            year_data_list.append({
                'committee': group,
                'budget': budget_value if pd.notna(budget_value) else 0
            })
        budget_data.append({
            'year': str(year),
            'data': year_data_list
        })
    
    palette = [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b',
        '#e377c2', '#7f7f7f', '#bcbd22', '#17becf', '#ff9896', '#98df8a',
        '#ffbb78', '#c5b0d5', '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d'
    ]
    colors = [palette[i % len(palette)] for i in range(len(groups))]

    return {
        'years': years,
        'committees': groups,
        'budget_data': budget_data,
        'colors': colors
    }

def generate_gemini_analysis(df, view_by):
    """Generates a textual analysis report using Gemini."""
    logger.info("Step 3/5: Starting Gemini analysis generation...")
    if not gemini_available or not GEMINI_API_KEY:
        raise Exception("Gemini AI is not available or API key is not configured.")

    logger.info("Configuring Gemini API...")
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash')
    logger.info("Gemini model initialized.")

    budget_cols = sorted([col for col in df.columns if 'budget' in col.lower()])
    years = [col.split('_')[0] for col in budget_cols]
    years_str = ", ".join(years)

    data_preview = df.head(10).to_string()
    
    logger.info("Constructing prompt for Gemini...")
    prompt = f"""
    You are a senior data analyst for a Sangguniang Kabataan (SK) council.
    Analyze the following project budget data, which is grouped by '{view_by}'.
    The data represents budget allocations across the years: {years_str}.

    Data Preview:
    {data_preview}

    Your task is to generate a professional analysis report in a JSON format.
    The report should explain the patterns visible in a stacked bar chart created from this data.

    Provide the following in your JSON response:
    1.  "summary": An executive summary of the key findings, focusing on the budget distribution by '{view_by}'.
    2.  "trends": A list of 2-3 significant trends (e.g., "Increased funding for Health", "Shift in focus from Environment to Education"). Each trend should have a "title", "description", and "type" ('positive', 'negative', or 'info').
    3.  "recommendations": A list of 2-3 actionable recommendations for the SK council based on the analysis. Each recommendation MUST be an object with an "action" key (e.g., [{{"action": "Increase funding for..."}}, {{"action": "Launch a new program..."}}]).
    4.  "confidence": Your confidence in the analysis as a float between 0.0 and 1.0.
    5.  "chartExplanation": An object explaining how to interpret the stacked bar chart. It should have a "title", "description", "keyInsights" (list), and "howToRead" (list).

    Generate ONLY the JSON object. Do not include markdown formatting like ```json or any other text.
    """
    logger.info(f"Prompt constructed. Length: {len(prompt)} characters.")
    
    try:
        logger.info("Step 4/5: Sending request to Gemini API... (This may take a while)")
        response = model.generate_content(prompt)
        logger.info("Step 4/5: Received response from Gemini API.")
        
        cleaned_response = response.text.strip()
        
        if cleaned_response.startswith('```json'):
            cleaned_response = cleaned_response[len('```json'):]
        if cleaned_response.endswith('```'):
            cleaned_response = cleaned_response[:-len('```')]
        
        logger.info("Parsing Gemini response...")
        analysis_result = json.loads(cleaned_response)
        logger.info("Successfully generated and parsed analysis report from Gemini.")
        return analysis_result
    except Exception as e:
        logger.error(f"Error generating or parsing Gemini analysis: {e}")
        return {
            "summary": "Failed to generate AI analysis due to an internal error.",
            "trends": [],
            "recommendations": ["Check backend logs for more details."],
            "confidence": 0.0,
            "chartExplanation": {
                "title": "Analysis Unavailable",
                "description": "The AI model could not generate a valid explanation.",
                "keyInsights": [],
                "howToRead": []
            },
            "error": True,
            "message": str(e)
        }

def main():
    """Main function to handle forecast generation."""
    logger.info("--- Starting Forecast Analysis Script ---")
    parser = argparse.ArgumentParser(description='Generate forecast data for SK projects.')
    parser.add_argument('--analysis', action='store_true', help='Include Gemini-powered analysis.')
    parser.add_argument('--view_by', type=str, default='Committee', help='The column to group data by for analysis (e.g., Committee, Category).')
    
    args = parser.parse_args()

    try:
        logger.info("Starting forecast generation process...")
        raw_df = get_database_data()
        df = process_db_data(raw_df)
        df.rename(columns={'committee': 'Committee', 'category': 'Category'}, inplace=True)

        if args.analysis:
            logger.info(f"Analysis mode enabled. View by: {args.view_by}")
            analysis = generate_gemini_analysis(df, args.view_by)
            
            logger.info("Step 5/5: Preparing final JSON response...")
            analysis['metadata'] = {
                'data_source': f"Database - {DB_DATABASE}",
                'total_projects_analyzed': len(df),
                'view_by': args.view_by,
                'gemini_used': True,
                'generated_at': datetime.now().isoformat(),
            }
            final_json = json.dumps(analysis, indent=2)
            logger.info("Step 5/5: Final JSON response prepared. Sending to output.")
            print(final_json)
            logger.info("--- Forecast Analysis Script Finished Successfully ---")
        else:
            logger.info("Generating chart data for Committee and Category views.")
            committee_data = generate_chart_data(df, 'Committee')
            category_data = generate_chart_data(df, 'Category')
            
            response = {
                "by_committee": committee_data,
                "by_category": category_data
            }
            print(json.dumps(response, indent=2))
            logger.info("--- Forecast Chart Data Script Finished Successfully ---")

    except Exception as e:
        logger.error(f"Forecast generation failed: {e}", exc_info=True)
        error_response = {
            'error': True,
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        }
        print(json.dumps(error_response, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()