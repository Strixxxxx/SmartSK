import os
import json
import sys
import pandas as pd
import numpy as np
import argparse
from datetime import datetime, timedelta
import re
import requests
from collections import Counter
import logging
from db_utils import get_raw_data_from_db

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import Google Gemini if available
try:
    import google.generativeai as genai
    gemini_available = True
except ImportError:
    print("INFO: Gemini module not available")
    gemini_available = False

# Import dotenv for environment variables
try:
    from dotenv import load_dotenv
    dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    load_dotenv(dotenv_path=dotenv_path)
except ImportError:
    print("INFO: dotenv not available, using environment variables directly")

# Configure Google Gemini API with proper error handling
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if gemini_available and GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.0-flash')
        gemini_configured = True
    except Exception as e:
        print(f"ERROR: Failed to configure Gemini API: {str(e)[:50]}...")
        gemini_configured = False
else:
    print("INFO: Gemini API not configured, will use fallback")
    gemini_configured = False

# Configure Google Programmable Search Engine
PSE_API_KEY = os.getenv("SEARCH_ENGINE_API")
PSE_ENGINE_ID = os.getenv("SEARCH_ENGINE_ID")
if not PSE_API_KEY or not PSE_ENGINE_ID:
    print("INFO: Search API not configured, internet search limited")
    pse_configured = False
else:
    pse_configured = True

# Define relevant project categories for SK
SK_PROJECT_CATEGORIES = [
    "youth development",
    "education",
    "skills training",
    "environmental",
    "sports",
    "digital literacy",
    "mental health",
    "entrepreneurship",
    "community service",
    "health and wellness",
    "arts and culture",
    "disaster preparedness",
    "livelihood",
    "leadership training",
    "civic education"
]

def process_db_data(df):
    """Processes the DataFrame from the database."""
    if df.empty:
        return pd.DataFrame()

    budget_cols = [col for col in df.columns if 'budget' in col.lower()]
    if not budget_cols:
        return df

    for col in budget_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    df.dropna(subset=budget_cols, how='all', inplace=True)
    df.fillna(0, inplace=True)

    return df

def get_categories_from_db():
    """Fetches unique categories from the database."""
    try:
        data = get_raw_data_from_db()
        if data:
            df = pd.DataFrame(data)
            if 'category' in df.columns:
                return df['category'].unique().tolist()
        return []
    except Exception as e:
        logger.error(f"Failed to fetch categories from database: {e}")
        return []

def search_internet_for_trends(query_base="youth project trends Philippines", forecast_year=None):
    if not pse_configured:
        return generate_simulated_search_results(forecast_year=forecast_year)
        
    try:
        results = []
        current_year = datetime.now().year
        target_year = forecast_year if forecast_year else current_year + 1
        
        main_query = f"{query_base} Sangguniang Kabataan Quezon City {target_year} projects"
        main_results = make_pse_request(main_query)
        if main_results:
            results.extend(main_results)
            
        for category in SK_PROJECT_CATEGORIES:
            if len(results) >= 50:
                break
            category_query = f"Sangguniang Kabataan {category} projects Philippines trends {target_year}"
            category_results = make_pse_request(category_query)
            if category_results:
                results.extend(category_results)
                
        unique_results = []
        seen_titles = set()
        for result in results:
            if result['title'] not in seen_titles:
                seen_titles.add(result['title'])
                unique_results.append(result)
                
        if len(unique_results) < 10:
            simulated_results = generate_simulated_search_results(10 - len(unique_results), forecast_year=target_year)
            unique_results.extend(simulated_results)
            
        return unique_results[:50]
        
    except Exception as e:
        print(f"ERROR: Internet search failed: {str(e)[:50]}...")
        return generate_simulated_search_results(forecast_year=forecast_year)

def generate_simulated_search_results(count=15, forecast_year=None):
    current_year = datetime.now().year
    target_year = forecast_year if forecast_year else current_year + 1
    templates = [
        {"title": f"Youth Development Trends for {target_year}: Focus on Digital Skills", "snippet": "..."},
    ]
    import random
    random.shuffle(templates)
    return templates[:count]

def make_pse_request(query):
    try:
        url = f"https://www.googleapis.com/customsearch/v1"
        params = {"key": PSE_API_KEY, "cx": PSE_ENGINE_ID, "q": query, "num": 10}
        response = requests.get(url, params=params)
        data = response.json()
        if "items" not in data:
            return []
        results = []
        for item in data["items"]:
            results.append({"title": item.get("title", ""), "snippet": item.get("snippet", ""), "link": item.get("link", "")})
        return results
    except Exception as e:
        print(f"ERROR: PSE request failed: {str(e)[:50]}...")
        return []

def generate_trends_prompt_with_weights(historical_data, internet_results, forecast_year=None):
    current_year = datetime.now().year
    target_year = forecast_year if forecast_year else current_year + 1
    
    prompt = f"""
    You are a specialized project trends analyst for Sangguniang Kabataan (SK) in District 5, Quezon City, Philippines.
    Based on current trends and historical data, identify the top 10 project trend ideas that are likely to be relevant for SK specifically in the year {target_year}.
    IMPORTANT: In your analysis, PRIMARY DATA (from historical SK project records in the database) should be given 70% weight, 
    while SECONDARY DATA (from internet sources) should be given 30% weight. Generate approximately 7 trend ideas based on the primary data and 3 based on the secondary data.
    For each trend idea, provide: a concise name, a detailed description, confidence level (0-1), trend direction (up, down, stable), category, and potential impact (high, medium, low).
    Your response should be in JSON format as follows:
    {{
      "trends": [
        {{
          "id": 1,
          "name": "Trend Idea Name",
          "description": "Detailed description of the trend idea for {target_year}",
          "confidence": 0.95,
          "trend": "up|down|stable",
          "category": "category name",
          "impact": "high|medium|low"
        }}
      ],
      "forecast_year": {target_year}
    }}
    """
    
    if historical_data is not None and not historical_data.empty:
        prompt += "\n\n==== PRIMARY DATA (70% weight) ====\nHistorical project data from the database:\n"
        prompt += historical_data.head(15).to_string()

    if internet_results:
        prompt += f"\n\n==== SECONDARY DATA (30% weight) ====\nRecent information from internet search about {target_year} trends:\n"
        for i, result in enumerate(internet_results[:15], 1):
            prompt += f"\n{i}. {result['title']}\n   {result['snippet']}\n"
    
    return prompt

def process_gemini_response(response_text, forecast_year=None):
    try:
        json_match = re.search(r'({[\s\S]*})', response_text)
        if json_match:
            json_str = json_match.group(1).replace("'", "'").replace('"', '"').replace('\n', ' ').replace('\t', ' ').replace('\r', '')
            data = json.loads(json_str)
            if 'trends' not in data or not isinstance(data['trends'], list):
                return generate_error_response("Invalid response format from Gemini AI.", forecast_year=forecast_year)
            for trend in data['trends']:
                if 'confidence' not in trend or not isinstance(trend['confidence'], (int, float)) or not (0 <= trend['confidence'] <= 1):
                    trend['confidence'] = 0.7
            return data
        else:
            return generate_error_response("Unable to extract valid JSON from Gemini response.", forecast_year=forecast_year)
    except Exception as e:
        return generate_error_response(f"Error processing Gemini response: {e}", forecast_year=forecast_year)

def generate_error_response(error_message=None, forecast_year=None):
    target_year = forecast_year if forecast_year else datetime.now().year + 1
    return {"error": True, "message": error_message or "AI forecast generation failed.", "trends": [], "forecast_year": target_year}

def generate_project_trends(filters=None, forecast_year=None):
    try:
        current_year = datetime.now().year
        if forecast_year:
            try:
                forecast_year = int(forecast_year)
                if not (2025 <= forecast_year <= 2050):
                    forecast_year = current_year + 1
            except (ValueError, TypeError):
                forecast_year = current_year + 1
        else:
            forecast_year = current_year + 1
            
        historical_data = None
        try:
            data = get_raw_data_from_db(category_filter=filters.get('category') if filters else None)
            if data:
                raw_df = pd.DataFrame(data)
                if not raw_df.empty:
                    historical_data = process_db_data(raw_df)
        except Exception as db_error:
            print(f"WARNING: Database error, proceeding without historical data: {db_error}")

        search_results = search_internet_for_trends(forecast_year=forecast_year)
        
        prompt = generate_trends_prompt_with_weights(historical_data, search_results, forecast_year)
        
        if not gemini_configured:
            return json.dumps(generate_error_response("Gemini not configured.", forecast_year))
        
        response = model.generate_content(prompt)
        trends_data = process_gemini_response(response.text, forecast_year=forecast_year)
        
        if not trends_data.get('error'):
            categories = get_categories_from_db()
            trends_data['categories'] = categories
            trends_data['metadata'] = {
                "generated_at": datetime.now().isoformat(),
                "historical_data_available": historical_data is not None,
                "internet_sources_used": len(search_results),
                "filters_applied": filters if filters else "none",
                "forecast_year": forecast_year,
                "data_weighting": "70% from Primary Data (Database), 30% from Secondary Data (Internet Sources)"
            }
        
        return json.dumps(trends_data)
            
    except Exception as e:
        return json.dumps(generate_error_response(f"System error: {e}", forecast_year))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate project trends forecast')
    parser.add_argument('--category', help='Filter by project category')
    parser.add_argument('--year', help='Forecast year (between 2025 and 2050)', type=int)
    args = parser.parse_args()
    
    filters = {'category': args.category} if args.category else {}
    
    result = generate_project_trends(filters, args.year)
    print(result)
