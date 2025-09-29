
import os
import json
import sys
import pandas as pd
import numpy as np
import argparse
from datetime import datetime
import re
import requests
import logging
from db_utils import get_raw_data_from_db

# ==============================================================================
# Configuration
# ==============================================================================

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
try:
    from dotenv import load_dotenv
    dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(dotenv_path):
        load_dotenv(dotenv_path=dotenv_path)
        logger.info("Environment variables loaded from .env file.")
except ImportError:
    logger.info("dotenv module not available, using system environment variables.")

# --- API and DB Credentials ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PSE_API_KEY = os.getenv("SEARCH_ENGINE_API")
PSE_ENGINE_ID = os.getenv("SEARCH_ENGINE_ID")

# --- Gemini Model Configuration ---
try:
    import google.generativeai as genai
    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.0-flash')
        gemini_configured = True
        logger.info("Gemini AI model configured successfully.")
    else:
        gemini_configured = False
        logger.warning("GEMINI_API_KEY not found. AI features will be disabled.")
except ImportError:
    gemini_configured = False
    logger.warning("Google Generative AI module not found. AI features will be disabled.")

# ==============================================================================
# Data Fetching and Processing
# ==============================================================================

def search_internet_for_trends(search_query):
    """Performs a web search using Google Programmable Search Engine."""
    if not all([PSE_API_KEY, PSE_ENGINE_ID]):
        logger.warning("PSE API Key or CX ID not configured. Skipping web search.")
        return []
    
    try:
        url = "https://www.googleapis.com/customsearch/v1"
        params = {'key': PSE_API_KEY, 'cx': PSE_ENGINE_ID, 'q': search_query, 'num': 10}
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        results = [{"title": item.get('title', ''), "snippet": item.get('snippet', '')} for item in data.get('items', [])]
        logger.info(f"Successfully fetched {len(results)} web search results.")
        return results
    except requests.exceptions.RequestException as e:
        logger.error(f"Web search request failed: {e}")
        return []

# ==============================================================================
# Prompt and AI Response Generation
# ==============================================================================

def generate_trends_prompt(primary_data, secondary_data, category, forecast_year):
    """Creates the prompt for the Gemini model."""
    
    # Dynamically create a focused instruction if a specific category is provided
    category_instruction = ""
    if category and category.lower() != 'general':
        category_instruction = f"""
    IMPORTANT: Your entire analysis and all generated trend ideas MUST focus exclusively on the user-selected category: '{category}'. 
    All trend ideas must belong to this category. Do not include trends from other categories, even if they appear in the historical data.
    """

    prompt = f"""
    You are a specialized project trends analyst for Sangguniang Kabataan (SK) in District 5, Quezon City, Philippines.
    Your task is to identify the top 10 project trend ideas for SK councils for the year {forecast_year}, based on the data provided.
    {category_instruction}

    DATA SOURCE WEIGHTING:
    - PRIMARY DATA (70%): Historical project data from the local database. This reflects past priorities and community needs.
    - SECONDARY DATA (30%): Real-time trends from internet search results. This provides external context.

    INSTRUCTIONS:
    1.  Analyze both data sources.
    2.  Generate a list of 10 trend ideas.
    3.  Approximately 7 trends should be directly inspired by the PRIMARY DATA.
    4.  Approximately 3 trends should be inspired by the SECONDARY DATA.
    5.  For each trend, provide a name, description, confidence score, trend direction, a relevant SK category, and impact level.
    6.  The final output must be a single JSON object with no other text or markdown.

    ---
    PRIMARY DATA (Database Records):
    {primary_data.to_string() if primary_data is not None and not primary_data.empty else "No historical data available."}
    ---
    SECONDARY DATA (Internet Search Results):
    {json.dumps(secondary_data, indent=2) if secondary_data else "No internet data available."}
    ---

    Provide your response in the following JSON format:
    {{
      "trends": [
        {{
          "id": 1,
          "name": "Trend Idea Name",
          "description": "Detailed description of the trend idea and its relevance for SK in {forecast_year}. All aspects of this trend must relate to the '{category}' category.",
          "confidence": 0.95,
          "trend": "up" or "down" or "stable",
          "category": "{category}",
          "impact": "high" or "medium" or "low"
        }}
      ],
      "forecast_year": {forecast_year},
      "category": "{category}"
    }}
    """
    return prompt

def get_ai_response(prompt):
    """Gets the analysis from the Gemini model."""
    if not gemini_configured:
        raise ConnectionError("Gemini AI is not configured. Please set the GEMINI_API_KEY.")
    try:
        response = model.generate_content(prompt)
        # Clean the response to ensure it is valid JSON
        cleaned_response = re.search(r'```json\n(.*?)\n```', response.text, re.DOTALL)
        if cleaned_response:
            json_text = cleaned_response.group(1)
        else:
            # Fallback for responses that might not have markdown
            json_text = response.text
        
        return json.loads(json_text)
    except Exception as e:
        logger.error(f"Error generating or parsing AI response: {e}")
        raise

# ==============================================================================
# Main Execution
# ==============================================================================

def main(custom_category, other_category, forecast_year):
    try:
        target_year = int(forecast_year) if forecast_year else datetime.now().year + 1
        
        # Determine search query and database filter
        db_category_filter = None
        search_category = "youth development"
        display_category = "General"

        if custom_category and custom_category != 'General':
            display_category = custom_category
            db_category_filter = custom_category
            search_category = custom_category
            if custom_category == 'Others' and other_category:
                display_category = other_category
                search_category = other_category

        # 1. Fetch Primary Data (Database)
        data = get_raw_data_from_db(category=db_category_filter)
        primary_data = pd.DataFrame(data) if data else pd.DataFrame()

        # 2. Fetch Secondary Data (Internet)
        search_query = f"Sangguniang Kabataan {search_category} project trends Philippines {target_year}"
        secondary_data = search_internet_for_trends(search_query)

        # 3. Generate AI Prompt
        prompt = generate_trends_prompt(primary_data, secondary_data, display_category, target_year)

        # 4. Get AI Response
        result = get_ai_response(prompt)

        # 5. Add Metadata and Finalize
        result['metadata'] = {
            "generated_at": datetime.now().isoformat(),
            "historical_data_points": len(primary_data) if primary_data is not None else 0,
            "internet_sources_used": len(secondary_data),
            "data_weighting": "70% from Primary Data (Database), 30% from Secondary Data (Internet Sources)"
        }
        
        print(json.dumps(result))

    except Exception as e:
        logger.error(f"An error occurred in the main execution: {e}")
        error_response = {
            "error": True,
            "message": f"System error: {e}"
        }
        print(json.dumps(error_response))
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate custom category project trends forecast.')
    parser.add_argument('--category', help='Custom category (e.g., Education, Sports, Others, General)')
    parser.add_argument('--otherCategory', help='User-defined category text when --category is "Others"')
    parser.add_argument('--year', help='Forecast year (e.g., 2026)')
    args = parser.parse_args()

    main(args.category, args.otherCategory, args.year)
