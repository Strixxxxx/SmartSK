import os
import sys
import json
import logging
from datetime import datetime
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

def process_db_data(df):
    """Processes the DataFrame from the database."""
    logger.info("Step 2/6: Processing database data...")
    if df.empty:
        return pd.DataFrame()

    budget_cols = [col for col in df.columns if 'budget' in col.lower()]
    if not budget_cols:
        return df

    for col in budget_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    df.dropna(subset=budget_cols, how='all', inplace=True)
    df.fillna(0, inplace=True)

    logger.info(f"Step 2/6: Processed {len(df)} rows with valid budget data.")
    return df

def perform_web_search(query, num_results=10):
    """Performs a web search using Google Programmable Search Engine."""
    logger.info(f"Step 3/6: Performing web search for '{query}'...")
    if not google_search_available or not PSE_API_KEY or not PSE_CX_ID:
        logger.warning("Web search is not available or not configured.")
        return "Web search not available or not configured.", 0

    try:
        service = build("customsearch", "v1", developerKey=PSE_API_KEY)
        res = service.cse().list(q=query, cx=PSE_CX_ID, num=num_results).execute()
        items = res.get('items', [])
        if not items:
            return "No relevant web search results found.", 0

        formatted_results = "Here are the top web search results for context:\n\n"
        for i, item in enumerate(items, 1):
            title = item.get('title', 'No Title')
            link = item.get('link', 'No Link')
            snippet = item.get('snippet', 'No Snippet').replace('\n', ' ')
            formatted_results += f"Source {i}: {title}\nLink: {link}\nSnippet: {snippet}\n\n"
        
        logger.info(f"Step 3/6: Successfully fetched {len(items)} web search results.")
        return formatted_results, len(items)
    except Exception as e:
        logger.error(f"An unexpected error occurred during web search: {e}")
        return f"An unexpected error occurred during web search: {e}", 0

def generate_gemini_analysis(df, options):
    """Generates a customized textual analysis report using Gemini."""
    logger.info("Step 4/6: Starting customized Gemini analysis generation...")
    if not gemini_available or not GEMINI_API_KEY:
        raise Exception("Gemini AI is not available or API key is not configured.")

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash')

    data_preview = df.head(10).to_string() if not df.empty else "No historical data available."
    
    category = options.get('category', 'general')
    forecast_year = datetime.now().year + 1
    search_query = f"Latest trends in youth development projects for {category} in the Philippines for {forecast_year}"
    
    web_search_results, sources_consulted = "", 0
    if options.get('include_trends', False):
        web_search_results, sources_consulted = perform_web_search(search_query)

    # Dynamically build the JSON structure for the prompt based on options
    structure_description = {
        "summary_report": "An executive summary of key findings, prioritizing historical data but incorporating insights from the web search."
    }
    if options.get('include_success_factors', False): structure_description["success_factors"] = ["A list of 3-5 key success factors..."]
    if options.get('include_recommendations', False): structure_description["recommendations"] = ["A list of 3-5 actionable recommendations..."]
    if options.get('include_risks', False): structure_description["risk_mitigation_strategies"] = [{"risk": "Identify a potential risk...", "mitigation": "Suggest a strategy..."}]
    if options.get('include_trends', False): structure_description["predicted_trends"] = ["A list of 3-5 predicted trends..."]
    if options.get('include_budget', False): structure_description["budget"] = {"analysis": "...", "historical_patterns": "...", "current_trends": "...", "recommendations": "..."}
    if options.get('include_implement_date', False): structure_description["implementation_date"] = {"analysis": "...", "historical_patterns": "...", "current_practices": "..."}
    if options.get('include_duration', False): structure_description["estimated_duration"] = {"analysis": "...", "historical_timeframes": "...", "complexity_factors": "..."}
    if options.get('include_feedback', False): structure_description["feedback"] = "A paragraph on expected community feedback..."
    structure_description["metadata"] = {}

    prompt = f'''
    You are a senior data analyst for a Sangguniang Kabataan (SK) council of District 5 Quezon City, providing a customized predictive analysis.
    Your task is to generate a professional analysis report in JSON format based on the user's request.
    The analysis should be based on the provided historical data and, if available, web search results.

    **1. Web Search Results (Context):**
    {web_search_results}

    **2. Historical Data Preview:**
    {data_preview}

    **3. JSON Output Requirements:**
    Generate a JSON object containing ONLY the fields requested in the structure below. Do NOT include fields that are not in the structure.
    Respond ONLY with a valid JSON object, no extra text or markdown.

    {json.dumps(structure_description, indent=2)}
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
        raise Exception(f"Failed to generate AI analysis: {e}")

def main():
    """Main function to handle customized predictive analysis."""
    if len(sys.argv) > 1:
        try:
            options = json.loads(sys.argv[1])
        except json.JSONDecodeError:
            print(json.dumps({"error": True, "message": "Invalid JSON input from command line."}))
            sys.exit(1)
    else:
        options = {}

    logger.info(f"Running customized analysis with options: {options}")
    category = options.get('category')

    try:
        data = get_raw_data_from_db(category_filter=category)
        if not data:
            print(json.dumps({
                "error": True,
                "message": "Insufficient data for analysis. The database query returned no results for the applied filters."
            }))
            return

        raw_df = pd.DataFrame(data)
        df = process_db_data(raw_df)

        # Generate analysis using the full options dictionary
        analysis, sources_consulted = generate_gemini_analysis(df, options)
        
        # Add metadata to the final response
        analysis.setdefault('metadata', {})
        analysis['metadata'].update({
            'analysis_type': 'customized',
            'internet_sources_consulted': sources_consulted,
            'data_source': "Database",
            'total_projects_analyzed': len(df),
            'gemini_used': True,
            'timestamp': datetime.now().isoformat(),
            'filters_applied': {'category': category, 'time_period': options.get('time_period'), 'time_detail': options.get('time_detail')}
        })

        print(json.dumps(analysis, indent=2))

    except Exception as e:
        logger.error(f"Predictive analysis failed: {e}", exc_info=True)
        error_response = {
            'error': True,
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        }
        print(json.dumps(error_response, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()