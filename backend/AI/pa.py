import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta
import pandas as pd
from db_utils import get_raw_data_from_db

try:
    import google.generativeai as genai
    gemini_available = True
except ImportError:
    gemini_available = False

try:
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    google_search_available = True
except ImportError:
    google_search_available = False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PSE_API_KEY = os.getenv("SEARCH_ENGINE_API")
PSE_CX_ID = os.getenv("SEARCH_ENGINE_ID")
DB_DATABASE = os.getenv("DB_DATABASE")

def process_db_data(df):
    """Processes the DataFrame from the database."""
    logger.info("Step 2/6: Processing database data...")
    if df.empty:
        logger.warning("No data to process, returning empty DataFrame.")
        return pd.DataFrame()

    # Identify budget columns
    budget_cols = [col for col in df.columns if 'budget' in col.lower()]
    
    # If no budget columns, there's nothing to process
    if not budget_cols:
        logger.warning("No budget-related columns found. Returning original data.")
        return df

    # Convert budget columns to numeric, coercing errors
    for col in budget_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Drop rows where all budget columns are NaN
    df.dropna(subset=budget_cols, how='all', inplace=True)
    
    # Fill remaining NaN values with 0
    df.fillna(0, inplace=True)

    if df.empty:
        logger.warning("No valid budget data found after processing.")
        return pd.DataFrame()

    logger.info(f"Step 2/6: Processed {len(df)} rows with valid budget data.")
    return df

def perform_web_search(query, num_results=15):
    """Performs a web search using Google Programmable Search Engine."""
    logger.info(f"Step 3/6: Performing web search for '{query}'...")
    if not google_search_available:
        logger.warning("Google Search API client not installed (google-api-python-client). Skipping web search.")
        return "Web search not available. The 'google-api-python-client' library is not installed.", 0
    
    if not PSE_API_KEY or not PSE_CX_ID:
        logger.warning("Programmable Search Engine API Key or CX ID not configured. Skipping web search.")
        return "Web search not configured. Please set PSE_API_KEY and PSE_CX_ID environment variables.", 0

    try:
        service = build("customsearch", "v1", developerKey=PSE_API_KEY)
        
        all_items = []
        num_fetched = 0
        page = 1
        max_pages = (num_results + 9) // 10

        while page <= max_pages:
            num_to_fetch = min(10, num_results - num_fetched)
            if num_to_fetch <= 0:
                break
            
            start_index = (page - 1) * 10 + 1
            res = service.cse().list(q=query, cx=PSE_CX_ID, num=num_to_fetch, start=start_index).execute()
            
            if 'items' in res:
                all_items.extend(res['items'])
                num_fetched += len(res['items'])
            
            page += 1

        if not all_items:
            logger.warning("No web search results found.")
            return "No relevant web search results found.", 0

        formatted_results = "Here are the top web search results to provide up-to-date, real-world context:\n\n"
        for i, item in enumerate(all_items, 1):
            title = item.get('title', 'No Title')
            link = item.get('link', 'No Link')
            snippet = item.get('snippet', 'No Snippet').replace('\n', ' ')
            formatted_results += f"Source {i}: {title}\nLink: {link}\nSnippet: {snippet}\n\n"
        
        logger.info(f"Step 3/6: Successfully fetched {len(all_items)} web search results.")
        return formatted_results, len(all_items)

    except HttpError as e:
        error_content = e.content.decode('utf-8') if e.content else str(e)
        logger.error(f"Error during web search: {error_content}")
        return f"Error during web search: Could not retrieve secondary data. Reason: {error_content}", 0
    except Exception as e:
        logger.error(f"An unexpected error occurred during web search: {e}", exc_info=True)
        return f"An unexpected error occurred during web search: {e}", 0

def generate_gemini_analysis(df, view_by, custom_category=None, forecast_year=None):
    """Generates a textual analysis report using Gemini, enhanced with web search."""
    logger.info("Step 4/6: Starting Gemini analysis generation...")
    if not gemini_available or not GEMINI_API_KEY:
        raise Exception("Gemini AI is not available or API key is not configured.")

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash')

    # Prepare data for the prompt
    budget_cols = sorted([col for col in df.columns if 'budget' in col.lower()])
    years = [col.split('_')[0] for col in budget_cols]
    years_str = ", ".join(years)
    data_preview = df.head(10).to_string() if not df.empty else "No historical data available."

    # Set the forecast year to be the upcoming year, overriding any provided value
    actual_forecast_year = datetime.now().year + 1
    if forecast_year and int(forecast_year) != actual_forecast_year:
        logger.warning(f"Provided forecast year ({forecast_year}) is ignored. Using upcoming year: {actual_forecast_year}")

    # Construct the search query and perform web search
    search_query = f"Latest trends in youth development projects for {custom_category or 'general'} in the Philippines for {actual_forecast_year}"
    web_search_results, sources_consulted = perform_web_search(search_query, num_results=15)

    prompt = f'''
    You are a senior data analyst for a Sangguniang Kabataan (SK) council of District 5 Quezon City, providing predictive analysis.

    Your task is to generate a professional analysis report in JSON format.
    The analysis should be based on the provided historical data and the web search results for up-to-date, real-world context.
    The historical data is the primary source and should be prioritized.

    **1. Web Search Results:**
    Here are the results from a web search for the query: '{search_query}'
    {web_search_results}

    **2. Analysis:**
    Based on the provided historical data below AND the web search results above, generate the report.

    **Historical Data Preview (Grouped by '{view_by}'):**
    {data_preview}
    This data shows budget allocations for the years: {years_str}.

    **3. JSON Output Requirements:**
    Provide a JSON object with the following structure. Do NOT include markdown formatting (```json).
    The response should be comprehensive and professional.

    {{
        "summary_report": "An executive summary of key findings, prioritizing historical data but incorporating insights from the web search.",
        "success_factors": [
            "A list of 3-4 key success factors for SK projects based on historical data and general knowledge from the search."
        ],
        "recommendations": [
            "A list of 3-5 actionable recommendations for the SK council for future projects, informed by the data and the search."
        ],
        "risk_mitigation_strategies": [
            {{
                "risk": "Identify a potential risk based on data or current trends from the search.",
                "mitigation": "Suggest a strategy to mitigate this risk."
            }},
            {{
                "risk": "Identify another potential risk.",
                "mitigation": "Suggest a strategy to mitigate this risk."
            }}
        ],
        "predicted_trends": [
            "A list of 3-4 predicted trends for youth projects, informed by the web search and the data."
        ],
        "budget": {{
            "analysis": "A detailed analysis of budget allocations and spending patterns.",
            "historical_patterns": "Describe historical budget patterns from the data.",
            "current_trends": "Describe current cost trends relevant to SK projects, informed by the search.",
            "recommendations": "Provide budget recommendations for the forecast year {actual_forecast_year}."
        }},
        "implementation_date": {{
            "analysis": "Analysis on the best time to start projects.",
            "historical_patterns": "Describe historical project start dates from the data.",
            "current_practices": "Describe current best practices for project scheduling from the search.",
            "seasonal_factors": "Mention any seasonal factors to consider.",
            "resource_considerations": "Discuss resource availability affecting timelines."
        }},
        "estimated_duration": {{
            "analysis": "An analysis of project durations based on the data.",
            "historical_timeframes": "Describe typical project durations from historical data.",
            "complexity_factors": "Explain how project complexity affects duration.",
            "current_standards": "Mention any current standards for project length from the search.",
            "dependencies": "Discuss dependencies that could affect project duration."
        }},
        "feedback": "A paragraph on the expected community feedback for the proposed types of projects.",
        "metadata": {{}}
    }}
    '''
    
    try:
        logger.info("Step 5/6: Sending request to Gemini API for analysis...")
        response = model.generate_content(prompt)
        
        cleaned_response = response.text.strip().replace('```json', '').replace('```', '')
        analysis_result = json.loads(cleaned_response)
        
        logger.info("Step 6/6: Successfully generated and parsed analysis report from Gemini.")
        return analysis_result, sources_consulted
    except Exception as e:
        logger.error(f"Error in Gemini analysis: {e}")
        return {"error": True, "message": f"Failed to generate AI analysis: {e}"}, 0

def main():
    """Main function to handle predictive analysis."""
    logger.info("--- Python script pa.py starting ---")
    logger.info(f"Received arguments: {sys.argv}")

    if len(sys.argv) > 1:
        try:
            options = json.loads(sys.argv[1])
            logger.info(f"Parsed options: {options}")
        except json.JSONDecodeError:
            logger.error(f"Failed to parse JSON from arguments: {sys.argv[1]}")
            options = {}
    else:
        options = {}

    view_by = options.get('view_by', 'Committee')
    category = options.get('category')
    custom_category = options.get('custom_category')
    year = options.get('year')

    logger.info(f"Category filter to be used: {category}")

    try:
        data = get_raw_data_from_db(category=category)

        if data:
            logger.info(f"Database query returned {len(data)} records.")
        else:
            logger.warning("Database query returned no data.")

        if not data:
            response = {
                "error": True,
                "message": "Insufficient data for analysis. The database query returned no results for the applied filters.",
                "trends": [],
                "metadata": {
                    "note": "The analysis could not be completed due to a lack of historical data. Please check the data source or broaden the filter criteria."
                }
            }
            print(json.dumps(response, indent=2))
            return

        raw_df = pd.DataFrame(data)
        df = process_db_data(raw_df)
        df.rename(columns={'committee': 'Committee', 'category': 'Category'}, inplace=True)

        analysis, sources_consulted = generate_gemini_analysis(df, view_by, custom_category, year)
        
        # Add metadata to the final response
        ph_tz = timezone(timedelta(hours=8))
        analysis.setdefault('metadata', {})
        analysis['metadata'].update({
            'internet_sources_consulted': sources_consulted,
            'data_source': "Database",
            'total_projects_analyzed': len(df),
            'view_by': view_by,
            'gemini_used': True,
            'timestamp': datetime.now(ph_tz).isoformat(),
            'filters_applied': {'category': category}
        })

        print(json.dumps(analysis, indent=2))

    except Exception as e:
        logger.error(f"Predictive analysis failed: {e}", exc_info=True)
        ph_tz = timezone(timedelta(hours=8))
        error_response = {
            'error': True,
            'message': str(e),
            'timestamp': datetime.now(ph_tz).isoformat()
        }
        print(json.dumps(error_response, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()