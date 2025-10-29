# Relevant Source Code

This document contains relevant source code snippets from the `backend` directory, categorized by language and functionality.

## Python

### AI/ML Logic

This section contains the Python scripts responsible for the AI and machine learning features of the application, including forecasting and predictive analysis.

#### `AI/db_utils.py`

This script provides utility functions to connect to the database and fetch raw data for the AI models.

```python
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
```

#### `AI/forecast.py`

This script generates forecast data and analysis using Google's Gemini AI.

```python
import os
import sys
import json
import argparse
import logging
from datetime import datetime, timezone, timedelta
import pandas as pd
from db_utils import get_raw_data_from_db

try:
    import google.generativeai as genai
    gemini_available = True
except ImportError:
    gemini_available = False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DB_DATABASE = os.getenv("DB_DATABASE")

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
    prompt = f'''
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
    3.  "recommendations": A list of 2-3 actionable recommendations for the SK council based on the analysis. Each recommendation MUST be an object with an "action" key (e.g., [{{{"action": "Increase funding for..."}}}, {{{"action": "Launch a new program..."}}}]).
    4.  "confidence": Your confidence in the analysis as a float between 0.0 and 1.0.
    5.  "chartExplanation": An object explaining how to interpret the stacked bar chart. It should have a "title", "description", "keyInsights" (list), and "howToRead" (list).

    Generate ONLY the JSON object. Do not include markdown formatting like ```json or any other text.
    '''
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
        raw_data = get_raw_data_from_db()
        raw_df = pd.DataFrame(raw_data)
        df = process_db_data(raw_df)
        df.rename(columns={'committee': 'Committee', 'category': 'Category'}, inplace=True)

        if args.analysis:
            logger.info(f"Analysis mode enabled. View by: {args.view_by}")
            analysis = generate_gemini_analysis(df, args.view_by)
            
            logger.info("Step 5/5: Preparing final JSON response...")
            ph_tz = timezone(timedelta(hours=8))
            analysis['metadata'] = {
                'data_source': f"Database - {DB_DATABASE}",
                'total_projects_analyzed': len(df),
                'view_by': args.view_by,
                'gemini_used': True,
                'generated_at': datetime.now(ph_tz).isoformat(),
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
            'timestamp': datetime.now(timezone(timedelta(hours=8))).isoformat(),
        }
        print(json.dumps(error_response, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
```

#### `AI/pa.py`

This script performs predictive analysis, enhanced with web search results.

```python
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
        return {{"error": True, "message": f"Failed to generate AI analysis: {e}"}}, 0

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
```

#### `AI/paCstm.py`

This script provides customized predictive analysis based on user-selected options.

```python
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
        data = get_raw_data_from_db(category=category)
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
```

#### `AI/paCstmTrends.py`

This script generates custom project trend forecasts.

```python
import os
import json
import sys
import pandas as pd
import argparse
from datetime import datetime, timezone, timedelta
import re
import requests
import logging
from db_utils import get_raw_data_from_db
from better_profanity import profanity

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

# --- Profanity Filter Setup ---
# You can expand these lists for more comprehensive filtering.
filipino_bad_words = [
    "putang ina", "puta", "gago", "tanga", "bobo", "ulol", "pakyu", 
    "hayop", "bwisit", "lintik", "leche", "animal ka", "ampucha", "ampota",
    "amputa", "anak ng tokwa", "bilat", "binibrocha", "demonyo", "engot",
    "hinayupak", "hindot", "inutil", "kupal", "pakingshet", "potangina", "tangina",
    "putragis", "pakshet", "tarantado", "ungas", "pota", "yawa", "tangalog", "bisakol", 
    "bisayawa", "putaragis", "potaragis", "hayup", "ampota", "bading", "bakla", "binibirocha", 
    "gaga", "punyeta", "ponyeta", "hinayupak", "sira ulo", "abnoy"
]
spanish_bad_words = [
    "joder", "mierda", "puta", "puto", "cabron", "gilipollas", "pendejo",
    "capullo", "hijoputa", "mamón", "marica", "maricón", " hijo de puta", "hijo de pota", "lechebay", "karajo"
]
profanity.add_censor_words(filipino_bad_words)
profanity.add_censor_words(spanish_bad_words)

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
    
    category_instruction = ""
    if category and category.lower() != 'general':
        category_instruction = f'''
    IMPORTANT: Your entire analysis and all generated trend ideas MUST focus exclusively on the user-selected category: '{category}'. 
    All trend ideas must belong to this category. Do not include trends from other categories, even if they appear in the historical data.
    '''

    prompt = f'''
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
    '''
    return prompt

def get_ai_response(prompt):
    """Gets the analysis from the Gemini model."""
    if not gemini_configured:
        raise ConnectionError("Gemini AI is not configured. Please set the GEMINI_API_KEY.")
    try:
        response = model.generate_content(prompt)
        cleaned_response = re.search(r'```json\n(.*?)\n```', response.text, re.DOTALL)
        if cleaned_response:
            json_text = cleaned_response.group(1)
        else:
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
        
        db_category_filter = None
        search_category = "youth development"
        display_category = "General"

        if custom_category and custom_category != 'General':
            display_category = custom_category
            db_category_filter = custom_category
            search_category = custom_category
            if custom_category == 'Others' and other_category:
                # Custom profanity check to catch substrings and variations
                is_profane = False
                text_to_check = other_category.lower()
                # Combine all profanity lists for a comprehensive check
                all_profanities = filipino_bad_words + spanish_bad_words
                for word in all_profanities:
                    if word.lower() in text_to_check:
                        is_profane = True
                        break
                
                if is_profane:
                    error_response = {
                        "error": True,
                        "message": "Profanity detected. The custom category contains inappropriate language. Please use respectful terms. (English, Filipino, and Spanish profanity is checked.)"
                    }
                    print(json.dumps(error_response))
                    sys.exit(1)
                
                display_category = other_category
                search_category = other_category

        data = get_raw_data_from_db(category=db_category_filter)
        primary_data = pd.DataFrame(data) if data else pd.DataFrame()

        search_query = f"Sangguniang Kabataan {search_category} project trends Philippines {target_year}"
        secondary_data = search_internet_for_trends(search_query)

        prompt = generate_trends_prompt(primary_data, secondary_data, display_category, target_year)

        result = get_ai_response(prompt)

        ph_tz = timezone(timedelta(hours=8))
        result['metadata'] = {
            "generated_at": datetime.now(ph_tz).isoformat(),
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
```

#### `AI/paTrends.py`

This script generates project trend analysis.

```python
import os
import json
import sys
import pandas as pd
import argparse
from datetime import datetime, timezone, timedelta
import re
import requests
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
    
    prompt = f'''
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
    '''
    
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
            data = get_raw_data_from_db(category=filters.get('category') if filters else None)
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
            ph_tz = timezone(timedelta(hours=8))
            trends_data['metadata'] = {
                "generated_at": datetime.now(ph_tz).isoformat(),
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
```

## Node.js

### Main Application

#### `main.js`

The main entry point for the Node.js application.

```javascript
// Add global error handlers to catch silent crashes
process.on('uncaughtException', (err, origin) => {
  console.error(`Caught exception: ${err}\n` + `Exception origin: ${origin}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Import the necessary modules
const express = require('express');
const http = require('http'); // Import http module
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { spawn } = require('child_process');
const os = require('os');
const dotenv = require('dotenv');

// Import WebSocket Initializer
const { initializeWebSocketServer, broadcast } = require('./websockets/websocket');

// Import the other js files
const routeGuard = require('./routeGuard/routeGuard');
const { getConnection, sql } = require('./database/database');
const forgotPasswordRoutes = require('./forgotpassword/forgotPassword');
const accountCreationRouter = require('./Admin/accountCreation');
const rolesRouter = require('./Admin/roles');
const backupRouter = require('./Admin/backup');
const sessionLogRouter = require('./Admin/sessionlog');
const projectSubmissionRouter = require('./projectSubmission/projectSubmission');
const emailRouter = require('./Email/email').router;
const loginRouter = require('./login/login');
const { authMiddleware, logout, validateToken } = require('./session/session');
const projectReviewRouter = require('./projectReview/projectReview');
const auditRouter = require('./audit/auditService').router;
const rawDataRouter = require('./rawdata/rawData');
const archiveRouter = require('./Admin/archive');
const accArchiveRouter = require('./Admin/accArchive');
const projArchiveRouter = require('./Admin/projArchive');
const projListRouter = require('./Admin/projList');
const postPublicRouter = require('./Posting/postPublic');
const protectedPostRouter = require('./Posting/post');
const pStatusListRouter = require('./Projects/pStatusList.js');

// Import the new PyBridge modules with error handling
let PyBridgeFC, PyBridgePA;

try {
  PyBridgeFC = require('./pyBridge/pyBridgeFC');
} catch (error) {
  console.error('Failed to load PyBridgeFC:', error.message);
  PyBridgeFC = null;
}

try {
  PyBridgePA = require('./pyBridge/pyBridgePA');
} catch (error) {
  console.error('Failed to load PyBridgePA:', error.message);
  PyBridgePA = null;
}

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

const corsOptions = {
  origin: process.env.CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Extended timeout middleware for upload endpoints
app.use((req, res, next) => {
  // Set longer timeout for upload and processing endpoints
  if (req.path.includes('/upload') || req.path.includes('/rawdata') || req.path.includes('/api/create-post')) {
    req.setTimeout(600000); // 10 minutes
    res.setTimeout(600000); // 10 minutes
    
    // Add keep-alive headers to prevent proxy timeouts
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=600, max=1000');
  }
  next();
});

// --- PUBLIC ROUTES ---
// Routes that don't need authentication and are publicly accessible.

if (loginRouter && typeof loginRouter === 'function') {
  app.use('/api/login', loginRouter);
} else {
  console.error('loginRouter is not a valid middleware function');
}

// Forgot password router
if (forgotPasswordRoutes && typeof forgotPasswordRoutes === 'function') {
  app.use('/api/forgotpassword', forgotPasswordRoutes);
} else {
  console.error('forgotPasswordRoutes is not a valid middleware function');
}

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/api/maintenance-status', (req, res) => {
  const flagPath = path.join(__dirname, 'maintenance.flag');
  fs.access(flagPath, fs.constants.F_OK, (err) => {
    res.json({ maintenance: !err });
  });
});

// --- POST /api/maintenance-end : End maintenance mode ---
app.post('/api/maintenance-end', (req, res) => {
    const maintenanceFlagPath = path.join(__dirname, 'maintenance.flag');
    
    try {
        if (fs.existsSync(maintenanceFlagPath)) {
            fs.unlinkSync(maintenanceFlagPath);
            console.log('[System] Maintenance mode ended via API call.');
            
            // Broadcast to all connected clients
            broadcast({ type: 'maintenance_ended' });
            
            res.status(200).json({ 
                success: true, 
                message: 'Maintenance mode ended successfully' 
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: 'System is not in maintenance mode' 
            });
        }
    } catch (error) {
        console.error('[System] Failed to end maintenance mode:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to end maintenance mode',
            error: error.message 
        });
    }
});

app.use('/api/posts', postPublicRouter);

// --- AUTHENTICATION MIDDLEWARE ---
// All routes defined after this point will be protected by the authMiddleware.
if (authMiddleware && typeof authMiddleware === 'function') {
  app.use(authMiddleware);
} else {
  console.error('authMiddleware is not a valid middleware function');
}


// --- PROTECTED ROUTES ---
// These routes require a valid token to be accessed.

app.get('/api/validate-token', validateToken);

// Logout route
app.post('/api/logout', logout);

// --- ADMIN ROUTES ---
// Create a main router for all admin-related endpoints.
const adminRouter = express.Router();

// Mount the specific admin routers onto the main admin router.
if (routeGuard.isAdmin && typeof routeGuard.isAdmin === 'function') {
  adminRouter.use(routeGuard.isAdmin);
} else {
  console.error('routeGuard.isAdmin is not a valid middleware function');
}

// Mount the specific admin routers onto the main admin router.
if (accountCreationRouter && typeof accountCreationRouter === 'function') {
  // Changed from '/accounts' to '/' to match frontend path /api/admin/users
  adminRouter.use('/user-list', accountCreationRouter);
} else {
  console.error('accountCreationRouter is not a valid middleware function');
}

if(backupRouter && typeof backupRouter === 'function') {
  adminRouter.use('/backup', backupRouter);
} else {
  console.error('backupRouter is not a valid middleware function');
}

if (sessionLogRouter && typeof sessionLogRouter === 'function') {
  adminRouter.use('/sessions', sessionLogRouter);
} else {
  console.error('sessionLogRouter is not a valid middleware function');
}

if (archiveRouter && typeof archiveRouter === 'function') {
  adminRouter.use('/archive', archiveRouter);
} else {
  console.error('archiveRouter is not a valid middleware function');
}

if (projArchiveRouter && typeof projArchiveRouter === 'function') {
  adminRouter.use('/proj-archive', projArchiveRouter);
} else {
  console.error('projArchiveRouter is not a valid middleware function');
}

if (accArchiveRouter && typeof accArchiveRouter === 'function') {
  adminRouter.use('/acc-archive', accArchiveRouter);
} else {
  console.error('accArchiveRouter is not a valid middleware function');
}

if (projListRouter && typeof projListRouter === 'function') {
  adminRouter.use('/project-list', projListRouter);
} else {
  console.error('projListRouter is not a valid middleware function');
}

if (protectedPostRouter && typeof protectedPostRouter === 'function') {
    app.use('/api', protectedPostRouter);
} else {
    console.error('postRouter is not a valid middleware function');
}

// Mount the consolidated admin router to the app.
app.use('/api/admin', adminRouter);

// Roles router is mounted separately to match frontend's expected path /api/roles/...
if (rolesRouter && typeof rolesRouter === 'function') {
  app.use('/api/roles', rolesRouter);
} else {
  console.error('rolesRouter is not a valid middleware function');
}

if (projectSubmissionRouter && typeof projectSubmissionRouter === 'function') {
  app.use('/api/projects', projectSubmissionRouter);
} else {
  console.error('projectSubmissionRouter is not a valid middleware function');
}

if (pStatusListRouter && typeof pStatusListRouter === 'function') {
  app.use('/api/projects', pStatusListRouter);
} else {
  console.error('pStatusListRouter is not a valid middleware function');
}

if (emailRouter && typeof emailRouter === 'function') {
  app.use('/api/email', emailRouter);
} else {
  console.error('emailRouter is not a valid middleware function');
}

if (projectReviewRouter && typeof projectReviewRouter === 'function') {
  app.use('/api/projectreview', projectReviewRouter);
} else {
  console.error('projectReviewRouter is not a valid middleware function');
}

if (auditRouter && typeof auditRouter === 'function') {
    app.use('/api/audit', auditRouter);
} else {
  console.error('auditRouter is not a valid middleware function');
}

if (rawDataRouter && typeof rawDataRouter === 'function') {
  app.use('/api/rawdata', rawDataRouter);
} else {
  console.error('rawDataRouter is not a valid middleware function');
}

// Check PyBridge modules - removed duplicate validation since it's handled in import section above

// Add or update the user-info endpoint
app.get('/api/user-data', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    return res.json({
      success: true,
      userInfo: req.user
    });

  } catch (error) {
    console.error('Error fetching user data');
    return res.status(500).json({ success: false, message: 'An error occurred while fetching user data' });
  }
});

// Forecast-related API endpoints using PyBridgeFC
app.get('/api/forecast', async (req, res) => {
  try {
    // Get any query parameters
    const options = req.query;
    
    // Run the forecast using PyBridgeFC
    const forecastData = await PyBridgeFC.runForecast(options);
    
    // Return the forecast data
    res.json(forecastData);
  } catch (error) {
    console.error('Error running forecast:', error);
    res.status(500).json({ 
      error: 'Failed to generate forecast',
      message: error.message
    });
  }
});

// Forecast analysis API endpoint
app.get('/api/forecast-analysis', (req, res) => {
  if (PyBridgeFC && typeof PyBridgeFC.handleForecastAnalysisRequest === 'function') {
    PyBridgeFC.handleForecastAnalysisRequest(req, res);
  } else {
    console.error('PyBridgeFC.handleForecastAnalysisRequest is not a valid middleware function');
    res.status(500).json({ error: 'Forecast analysis service unavailable' });
  }
});

// Project trends API endpoint (now uses PyBridgePA since fcTrends.py became paTrends.py)
app.get('/api/project-trends', (req, res) => {
  if (PyBridgePA && typeof PyBridgePA.handleProjectTrendsRequest === 'function') {
    PyBridgePA.handleProjectTrendsRequest(req, res);
  } else {
    console.error('PyBridgePA.handleProjectTrendsRequest is not a valid middleware function');
    res.status(500).json({ error: 'Project trends service unavailable' });
  }
});

// Custom project trends API endpoint (now uses PyBridgePA since fcCstmTrends.py became paCstmTrends.py)
app.get('/api/custom-project-trends', (req, res) => {
  if (PyBridgePA && typeof PyBridgePA.handleCustomProjectTrendsRequest === 'function') {
    PyBridgePA.handleCustomProjectTrendsRequest(req, res);
  } else {
    console.error('PyBridgePA.handleCustomProjectTrendsRequest is not a valid middleware function');
    res.status(500).json({ error: 'Custom project trends service unavailable' });
  }
});


// Predictive Analysis Routes using PyBridgePA
app.get('/api/predictive-analysis/trends', (req, res) => {
  if (PyBridgePA && typeof PyBridgePA.handlePaTrendsRequest === 'function') {
    PyBridgePA.handlePaTrendsRequest(req, res);
  } else {
    console.error('PyBridgePA.handlePaTrendsRequest is not a valid middleware function');
    res.status(500).json({ error: 'Predictive analysis trends service unavailable' });
  }
});

app.post('/api/predictive-analysis', (req, res) => {
  if (PyBridgePA && typeof PyBridgePA.handlePredictiveAnalysisRequest === 'function') {
    PyBridgePA.handlePredictiveAnalysisRequest(req, res);
  } else {
    console.error('PyBridgePA.handlePredictiveAnalysisRequest is not a valid middleware function');
    res.status(500).json({ error: 'Predictive analysis service unavailable' });
  }
});

app.post('/api/predictive-analysis/custom', (req, res) => {
  if (PyBridgePA && typeof PyBridgePA.handleCustomizedAnalysisRequest === 'function') {
    PyBridgePA.handleCustomizedAnalysisRequest(req, res);
  } else {
    console.error('PyBridgePA.handleCustomizedAnalysisRequest is not a valid middleware function');
    res.status(500).json({ error: 'Customized predictive analysis service unavailable' });
  }
});

// Determine the correct Python executable based on the OS
const getPythonExecutable = () => {
  const platform = os.platform();
  // On Windows, typically just 'python' is used
  if (platform === 'win32') {
    return 'python';
  }
  // On macOS and Linux, try 'python3' first
  return 'python3';
};

// Python executable name
const PYTHON_EXECUTABLE = getPythonExecutable();

// Update your existing predictive analysis endpoint to handle customization options
app.post('/api/predictive-analysis/custom-options', async (req, res) => {
  try {
    // Get analysis options from request body
    const options = {
      analysis_type: req.body.analysis_type || 'general',
      category: req.body.category || 'None',
      time_period: req.body.time_period || 'None',
      include_budget: req.body.include_budget,
      include_duration: req.body.include_duration,
      include_implement_date: req.body.include_implement_date,
      include_recommendations: req.body.include_recommendations,
      include_risks: req.body.include_risks,
      include_trends: req.body.include_trends,
      include_success_factors: req.body.include_success_factors,
      include_feedback: req.body.include_feedback
    };
    
    // Use PyBridgePA for predictive analysis
    const analysisResult = await PyBridgePA.runPredictiveAnalysis(options);
    res.json(analysisResult);
    
  } catch (error) {
    console.error('Error in predictive analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

// Define the port
const PORT = process.env.PORT;

// Create HTTP server and integrate WebSocket server
const server = http.createServer(app);
initializeWebSocketServer(server);

// Check for maintenance flag on startup
const flagPath = path.join(__dirname, 'maintenance_complete.flag');
if (fs.existsSync(flagPath)) {
    console.log('[System] Maintenance flag found. Server has restarted after a restore.');
    global.maintenanceJustFinished = true;
    fs.unlinkSync(flagPath); // Delete the flag after acknowledging it

    // Delete maintenance.flag and broadcast maintenance ended
    const maintenanceFlagPath = path.join(__dirname, 'maintenance.flag');
    if (fs.existsSync(maintenanceFlagPath)) {
        fs.unlinkSync(maintenanceFlagPath);
        console.log('[System] Maintenance mode flag removed.');
        
        // Broadcast maintenance ended after server restart
        setTimeout(() => {
            broadcast({ type: 'maintenance_ended' });
            console.log('[System] Broadcasted maintenance_ended to all clients.');
        }, 2000); // Wait 2 seconds for WebSocket server to be ready
    }
}

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
```

### Admin Logic

#### `Admin/accArchive.js`

Handles archiving and restoring user accounts.

```javascript
const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');
const { decrypt } = require('../utils/crypto');

// GET all archived accounts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        u.userID, 
        u.username, 
        u.fullName, 
        r.roleName as position, 
        b.barangayName as barangay, 
        u.emailAddress, 
        u.phoneNumber,
        u.isArchived
      FROM userInfo u
      LEFT JOIN roles r ON u.position = r.roleID
      LEFT JOIN barangays b ON u.barangay = b.barangayID
      WHERE u.isArchived = 1
      ORDER BY u.fullName
    `);

    const decryptedData = result.recordset.map(user => ({
        ...user,
        username: decrypt(user.username),
        fullName: decrypt(user.fullName),
        emailAddress: decrypt(user.emailAddress),
        phoneNumber: decrypt(user.phoneNumber),
    }));

    res.json({ success: true, data: decryptedData });
  } catch (error) {
    console.error('Error fetching archived accounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch archived accounts.' });
  }
});

// POST to archive an account
router.post('/:userId', authMiddleware, async (req, res) => {
    const { userId } = req.params;
    try {
        const pool = await getConnection();

        const userToArchive = await pool.request()
            .input('userID', sql.Int, userId)
            .query('SELECT username FROM userInfo WHERE userID = @userID');

        if (userToArchive.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const decryptedUsername = decrypt(userToArchive.recordset[0].username);

        // Update the isArchived flag instead of calling the stored procedure
        await pool.request()
            .input('userID', sql.Int, userId)
            .query('UPDATE userInfo SET isArchived = 1 WHERE userID = @userID');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'archive-account',
            descriptions: `Admin ${req.user.fullName} archived account for user: ${decryptedUsername}`
        });

        res.json({ success: true, message: 'Account archived successfully.' });
    } catch (error) {
        console.error(`Error archiving account ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to archive account.' });
    }
});

// POST to restore an archived account
router.post('/restore/:userId', authMiddleware, async (req, res) => {
    const { userId } = req.params;
    try {
        const pool = await getConnection();
        
        // Check if the user exists and is actually archived
        const userToRestore = await pool.request()
            .input('userID', sql.Int, userId)
            .query('SELECT username, isArchived FROM userInfo WHERE userID = @userID');

        if (userToRestore.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const { username, isArchived } = userToRestore.recordset[0];
        const decryptedUsername = decrypt(username);

        if (!isArchived) {
            return res.status(400).json({ success: false, message: 'User is not archived.' });
        }

        // Update the isArchived flag to restore the user
        await pool.request()
            .input('userID', sql.Int, userId)
            .query('UPDATE userInfo SET isArchived = 0 WHERE userID = @userID');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'restore-account',
            descriptions: `Admin ${req.user.fullName} restored account for user: ${decryptedUsername}`
        });

        res.json({ success: true, message: 'Account restored successfully.' });
    } catch (error) {
        console.error(`Error restoring account ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to restore account.' });
    }
});

module.exports = router;
```

#### `Admin/accountCreation.js`

Handles the creation of new user accounts.

```javascript
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { sendAccountCreationEmail } = require('../Email/email');
const { addAuditTrail } = require('../audit/auditService');
const { decrypt } = require('../utils/crypto');

// Get all users
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Check if user has MA or SA position
    if (req.user.position !== 'MA' && req.user.position !== 'SA') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access. Master Admin privileges required.'
      });
    }

    // Get database connection
    const pool = await getConnection();

    // Fetch all non-archived users
    const users = await pool.request()
      .query(`
        SELECT 
          userName,
          fullName,
          emailAddress,
          phoneNumber,
          isArchived
        FROM userInfo
        WHERE isArchived = 0
        ORDER BY fullName ASC
      `);

    // Decrypt user data before sending to client
    const processedUsers = users.recordset.map(user => ({
      userName: decrypt(user.userName),
      fullName: decrypt(user.fullName),
      emailAddress: decrypt(user.emailAddress),
      phoneNumber: decrypt(user.phoneNumber),
      actualStatus: user.isArchived ? 'inactive' : 'active'
    }));

    return res.status(200).json({
      success: true,
      users: processedUsers
    });

  } catch (error) {
    console.error('Error fetching users');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching users'
    });
  }
});

const { encrypt, generateEmailHash, generateUsernameHash } = require('../utils/crypto');

// Create new account
router.post('/create-account', authMiddleware, async (req, res) => {
  try {
    // Check if user has MA or SA position
    if (req.user.position !== 'MA' && req.user.position !== 'SA') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access. Master Admin privileges required.'
      });
    }

    const {
      username,
      fullName,
      barangay,
      emailAddress,
      phoneNumber,
      password
    } = req.body;

    // Validate required fields
    if (!username || !fullName || !barangay || !emailAddress || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Email validation
    const emailRegex = /@(gmail\.com|outlook\.com|yahoo\.com)$/i;
    if (!emailRegex.test(emailAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email domain. Only @gmail.com, @outlook.com, and @yahoo.com are allowed.'
      });
    }

    // Get database connection
    const pool = await getConnection();

    // Check if email or username already exists using hashes
    const emailHash = generateEmailHash(emailAddress);
    const usernameHash = generateUsernameHash(username);

    const emailCheck = await pool.request()
      .input('emailHash', sql.VarChar, emailHash)
      .query('SELECT userID FROM userInfo WHERE emailHash = @emailHash');

    if (emailCheck.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Email address already exists' });
    }

    const usernameCheck = await pool.request()
      .input('usernameHash', sql.VarChar, usernameHash)
      .query('SELECT userID FROM userInfo WHERE usernameHash = @usernameHash');

    if (usernameCheck.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }

    // Get barangayID from barangay name
    const barangayResult = await pool.request()
      .input('barangayName', sql.NVarChar, barangay)
      .query('SELECT barangayID FROM barangays WHERE barangayName = @barangayName');

    if (barangayResult.recordset.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid barangay provided' });
    }
    const barangayID = barangayResult.recordset[0].barangayID;

    // Get roleID for 'SKO'
    const roleResult = await pool.request()
      .input('roleName', sql.NVarChar, 'SKO')
      .query('SELECT roleID FROM roles WHERE roleName = @roleName');

    if (roleResult.recordset.length === 0) {
      return res.status(500).json({ success: false, message: 'Default role "SKO" not found in database.' });
    }
    const positionID = roleResult.recordset[0].roleID;

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Encrypt user data
    const encryptedUsername = encrypt(username);
    const encryptedFullName = encrypt(fullName);
    const encryptedEmail = encrypt(emailAddress);
    const encryptedPhone = encrypt(phoneNumber);

    // Insert new user
    const result = await pool.request()
      .input('username', sql.NVarChar, encryptedUsername)
      .input('fullName', sql.NVarChar, encryptedFullName)
      .input('barangayID', sql.Int, barangayID)
      .input('emailAddress', sql.NVarChar, encryptedEmail)
      .input('phoneNumber', sql.NVarChar, encryptedPhone)
      .input('passKey', sql.NVarChar, hashedPassword)
      .input('positionID', sql.Int, positionID)
      .input('emailHash', sql.VarChar, emailHash)
      .input('usernameHash', sql.VarChar, usernameHash)
      .query(`
        INSERT INTO userInfo (
          username,
          fullName,
          barangay,
          emailAddress,
          phoneNumber,
          passKey,
          position,
          isDefaultPassword,
          emailHash,
          usernameHash
        )
        VALUES (
          @username,
          @fullName,
          @barangayID,
          @emailAddress,
          @phoneNumber,
          @passKey,
          @positionID,
          1,
          @emailHash,
          @usernameHash
        );
        SELECT SCOPE_IDENTITY() AS userID;
      `);

    const userId = result.recordset[0].userID;

    // Send account creation email
    const emailResult = await sendAccountCreationEmail(username, emailAddress);
    
    if (!emailResult.success) {
      console.error('Failed to send account creation email');
    }
    addAuditTrail({
        actor: 'A',
        module: 'C',
        userID: req.user.userId,
        actions: 'create-account',
        oldValue: null,
        newValue: `Username: ${username}`,
        descriptions: `Admin ${req.user.fullName} created a new account for ${username}`
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      userId
    });

  } catch (error) {
    console.error('Error creating account', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating the account'
    });
  }
});

module.exports = router;
```
