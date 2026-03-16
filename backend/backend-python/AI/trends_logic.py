import os
import json
import logging
from datetime import datetime, timezone, timedelta
import pandas as pd
import re

from .gemini_utils import call_gemini_with_retry, PRIMARY_MODEL

try:
    import google.genai as genai
    gemini_available = True
except ImportError:
    gemini_available = False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def generate_gemini_trends(df, category, api_key):
    """
    Generates a list of 10 project trends using the Gemini API,
    based on the provided data and a specific category.
    """
    logger.info(f"Starting Gemini trends generation for category: '{category}'")
    if not gemini_available or not api_key:
        raise ConnectionError("Gemini AI is not available or API key is not configured.")

    # genai.configure is now handled in get_gemini_client() in gemini_utils.py

    # --- Data Preparation for Prompt ---
    data_preview = df.head(15).to_string() if not df.empty else "No historical data available."
    forecast_year = datetime.now().year + 1

    category_focus = category if category != 'General' else 'all project categories'

    prompt = f'''
    You are a specialized project trends analyst for Sangguniang Kabataan (SK) in District 5, Quezon City, Philippines.
    Your task is to generate 10 potential project trend ideas for the upcoming year ({forecast_year}) based ONLY on the historical data provided.
    The analysis must focus on: {category_focus}.

    **1. Historical Data Preview (Primary and ONLY source):**
    {data_preview}

    **2. JSON Output Requirements:**
    Provide a JSON object containing a list of 10 trend objects. Each object must have the following exact structure:

    {{
      "trends": [
        {{
          "id": 1,
          "name": "Trend Name",
          "description": "A brief description of the trend, based on patterns in the historical data.",
          "confidence": 0.85,
          "trend": "up" or "down",
          "category": "{category}",
          "impact": "high", "medium", or "low"
        }}
      ]
    }}

    **CRITICAL:**
    - Generate ONLY the JSON object. Do not include markdown formatting (```json) or any other text.
    - Your entire response must be based strictly on the provided data preview.
    - Ensure the 'category' field in each trend object is exactly "{category}".
    '''

    # Define the validation function for this specific report
    def is_valid_trends_response(data):
        return 'trends' in data and isinstance(data.get('trends'), list)

    # Call the utility
    analysis_result = call_gemini_with_retry(prompt, is_valid_trends_response)

    if analysis_result:
        logger.info(f"Successfully generated and parsed trends report for '{category}'.")
        return analysis_result
    else:
        logger.error(f"Failed to generate Gemini trends for '{category}' after multiple attempts.")
        return {
            "error": True,
            "message": f"Failed to generate valid trends for '{category}' after 5 attempts.",
            "trends": []
        }

def generate_trends_report(df, api_key, category='General'):
    """
    The main function to generate a trends report for a given dataset and category.

    Args:
        df (pd.DataFrame): The input DataFrame containing historical project data.
        api_key (str): The Gemini API key.
        category (str): The specific category to generate trends for. Defaults to 'General'.

    Returns:
        dict: A dictionary containing the trends report.
    """
    logger.info(f"--- Starting Trends Report for category: '{category}' ---")

    try:
        # Apply category filter if it's not a general report
        filtered_df = df.copy()
        if category != 'General' and 'category' in filtered_df.columns:
            filtered_df = filtered_df[filtered_df['category'].str.lower() == category.lower()]

        if filtered_df.empty:
            logger.warning(f"No data available for category '{category}'. Cannot generate trends.")
            return {
                "trends": [],
                "error": True,
                "message": f"No historical data found for the category: {category}."
            }

        # Generate trends from Gemini
        logger.info(f"Requesting 10 project trends for '{category}' from Gemini AI...")
        trends_data = generate_gemini_trends(filtered_df, category, api_key)
        
        # Add metadata
        ph_tz = timezone(timedelta(hours=8))
        trends_data['metadata'] = {
            'data_source': "Historical Data",
            'total_projects_analyzed': len(filtered_df),
            'category_filter': category,
            'timestamp': datetime.now(ph_tz).isoformat(),
            'gemini_used': not trends_data.get('error', False)
        }
        
        logger.info(f"Successfully generated trends for category: '{category}'.")
        return trends_data

    except Exception as e:
        logger.error(f"An unhandled error occurred in generate_trends_report for '{category}': {e}", exc_info=True)
        raise  # Re-raise the exception to signal failure to the caller
