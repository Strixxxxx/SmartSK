import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta
import pandas as pd
from db_utils import get_raw_data_from_db
import re

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

def reorder_citations(analysis_result):
    """
    Reorders citations based on their first appearance in a predefined field order.
    Ensures citation numbers are sequential and correctly mapped.
    """
    if not analysis_result or 'citations' not in analysis_result:
        return analysis_result

    # Define the logical order of fields to scan for citations
    field_order = [
        "summary_report", "success_factors", "recommendations", 
        "risk_mitigation_strategies", "predicted_trends", "budget", 
        "implementation_date", "estimated_duration", "feedback", "trends"
    ]

    # Step 1: Build a single string by concatenating content in the correct order
    full_text = ""
    
    def build_text_in_order(obj):
        nonlocal full_text
        if isinstance(obj, dict):
            # Process fields in the predefined order
            for key in field_order:
                if key in obj:
                    build_text_in_order(obj[key])
            # Process any remaining fields not in the order (just in case)
            for key, value in obj.items():
                if key not in field_order and key not in ['citations', 'metadata']:
                    build_text_in_order(value)
        elif isinstance(obj, list):
            for item in obj:
                build_text_in_order(item)
        elif isinstance(obj, str):
            full_text += obj + " "

    build_text_in_order(analysis_result)

    # Step 2: Create a mapping from old ID to new ID based on appearance order in full_text
    ordered_citation_ids = []
    old_to_new_id_map = {}
    new_id_counter = 1
    
    for match in re.finditer(r'\[(\d+)\]', full_text):
        old_id = int(match.group(1))
        if old_id not in old_to_new_id_map:
            # Ensure the old_id actually exists in the original citations
            if any(c['id'] == old_id for c in analysis_result.get('citations', [])):
                old_to_new_id_map[old_id] = new_id_counter
                ordered_citation_ids.append(old_id)
                new_id_counter += 1

    if not old_to_new_id_map:
        # This can happen if text has markers like [1] but citations array is empty or mismatched
        # Let's strip markers from the text and empty the citations array
        def strip_markers(obj):
            if isinstance(obj, dict):
                for key, value in obj.items():
                    if isinstance(value, str):
                        obj[key] = re.sub(r'\[\d+\]', '', value).strip()
                    else:
                        strip_markers(value)
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    if isinstance(item, str):
                        obj[i] = re.sub(r'\[\d+\]', '', item).strip()
                    else:
                        strip_markers(item)
        
        strip_markers(analysis_result)
        analysis_result['citations'] = []
        return analysis_result

    # Step 3: Update all text fields everywhere with the new citation numbers
    def replace_ids_in_obj(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if isinstance(value, str):
                    def replace_func(match):
                        old_id = int(match.group(1))
                        # Replace if in map, otherwise remove (it's a hallucinated citation)
                        return f"[{old_to_new_id_map[old_id]}]" if old_id in old_to_new_id_map else ""
                    obj[key] = re.sub(r'\[(\d+)\]', replace_func, value)
                else:
                    replace_ids_in_obj(value)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                if isinstance(item, str):
                    def replace_func(match):
                        old_id = int(match.group(1))
                        return f"[{old_to_new_id_map[old_id]}]" if old_id in old_to_new_id_map else ""
                    obj[i] = re.sub(r'\[(\d+)\]', replace_func, item)
                else:
                    replace_ids_in_obj(item)

    replace_ids_in_obj(analysis_result)

    # Step 4: Re-create and sort the citations array
    original_citations_map = {c['id']: c for c in analysis_result.get('citations', [])}
    new_citations_list = []

    for old_id in ordered_citation_ids:
        if old_id in original_citations_map:
            citation = original_citations_map[old_id]
            new_id = old_to_new_id_map[old_id]
            new_citations_list.append({
                'id': new_id,
                'title': citation.get('title', 'No Title'),
                'url': citation.get('url', 'No Link'),
                'snippet': citation.get('snippet', 'No Snippet')
            })

    analysis_result['citations'] = new_citations_list
    return analysis_result

def verify_and_fix_citations(analysis_result, web_search_results):
    """
    Attempts to match hallucinated citations with actual web search results
    and fix them if possible.
    """
    if not analysis_result or 'citations' not in analysis_result:
        return analysis_result
    
    if not web_search_results:
        return analysis_result
    
    # Parse web search results to extract actual URLs
    actual_urls = []
    for line in web_search_results.split('\n'):
        if line.startswith('Link: '):
            actual_urls.append(line.replace('Link: ', '').strip())
    
    if not actual_urls:
        return analysis_result
    
    # Try to match suspicious citations with actual URLs
    fixed_citations = []
    for citation in analysis_result.get('citations', []):
        url = citation.get('url', '')
        
        # Check if it's a suspicious URL
        if any(domain in url.lower() for domain in ['example.com', 'invalid', 'placeholder']):
            logger.warning(f"Attempting to fix suspicious citation ID {citation.get('id')}: {url}")
            
            # Try to find a matching actual URL based on title similarity
            # (simple approach: use the citation ID to map to search result order)
            citation_id = citation.get('id', 0)
            if 0 < citation_id <= len(actual_urls):
                original_url = url
                citation['url'] = actual_urls[citation_id - 1]
                logger.info(f"Fixed citation {citation_id}: {original_url} -> {citation['url']}")
        
        fixed_citations.append(citation)
    
    analysis_result['citations'] = fixed_citations
    return analysis_result


def validate_citations(analysis_result):
    """
    Validates that citations contain real URLs, not placeholders.
    Logs warnings for suspicious citations.
    """
    if not analysis_result or 'citations' not in analysis_result:
        return analysis_result
    
    suspicious_domains = ['example.com', 'invalid', 'placeholder', 'test.com', 'sample.com']
    valid_citations = []
    
    for citation in analysis_result.get('citations', []):
        url = citation.get('url', '')
        is_suspicious = any(domain in url.lower() for domain in suspicious_domains)
        
        if is_suspicious:
            logger.warning(f"SUSPICIOUS CITATION DETECTED: ID {citation.get('id')} has placeholder URL: {url}")
            logger.warning("The AI generated a fake URL instead of using web search results")
        else:
            valid_citations.append(citation)
    
    if len(valid_citations) < len(analysis_result.get('citations', [])):
        logger.warning(f"Removed {len(analysis_result['citations']) - len(valid_citations)} fake citations")
    
    analysis_result['citations'] = valid_citations
    return analysis_result

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

def perform_web_search(query, num_results=30):
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
    """Generates a textual analysis report using Gemini, enhanced with web search and citations."""
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

    # Set the forecast year to be the upcoming year
    actual_forecast_year = datetime.now().year + 1
    if forecast_year and int(forecast_year) != actual_forecast_year:
        logger.warning(f"Provided forecast year ({forecast_year}) is ignored. Using upcoming year: {actual_forecast_year}")

    # Construct the search query and perform web search
    search_query = f"Latest trends in youth development projects for {custom_category or 'general'} in the Philippines for {actual_forecast_year}"
    web_search_results, sources_consulted = perform_web_search(search_query, num_results=10)

    prompt = f'''
    You are a senior data analyst for a Sangguniang Kabataan (SK) council of District 5 Quezon City, providing predictive analysis with VERIFIABLE CITATIONS.

    **CRITICAL CITATION REQUIREMENTS - READ CAREFULLY:**
    1. You MUST use the EXACT URLs provided in the web search results below.
    2. DO NOT generate fake URLs like "https://example.com" or "invalid".
    3. Each citation in the final `citations` array MUST have a real URL from the search results (copy it exactly), the exact title, and a relevant snippet.
    4. If you reference information from "Source 1" in the web search results, your citation [1] must use the EXACT link provided for Source 1.
    5. Number citations [1], [2], [3] in order of first appearance in your analysis text.
    6. VERIFY every URL you include is from the actual web search results provided below.

    **1. Web Search Results (30% weight - CITE THESE WITH EXACT URLs):**
    CRITICAL: When you cite a source below, you MUST:
    - Use the EXACT "Link:" provided for that source.
    - Do NOT make up URLs like "https://example.com".
    - Copy the link character-for-character from the Source below.
    {web_search_results}

    **2. Historical Data Preview (70% weight - Primary source):**
    {data_preview}
    Years covered: {years_str}

    **3. JSON Output Requirements:**
    Provide a JSON object with this EXACT structure. Include citations [1], [2], etc. in all text fields where you reference web search results.

    {{
        "summary_report": "Executive summary citing web sources [1] where applicable [2].",
        "success_factors": [
            "Success factor with citation [1] if from web search.",
            "Another factor [2]."
        ],
        "recommendations": [
            "Recommendation with supporting citation [1].",
            "Another recommendation [3]."
        ],
        "risk_mitigation_strategies": [
            {{
                "risk": "Risk description [1].",
                "mitigation": "Mitigation strategy [2]."
            }}
        ],
        "predicted_trends": [
            "Trend prediction with evidence [1].",
            "Another trend [2]."
        ],
        "budget": {{
            "analysis": "Detailed budget analysis with citations [1].",
            "historical_patterns": "Historical patterns from data (no citation needed).",
            "current_trends": "Current cost trends with citations [2].",
            "recommendations": "Budget recommendations for {actual_forecast_year} [3]."
        }},
        "implementation_date": {{
            "analysis": "Best timing analysis [1].",
            "historical_patterns": "Historical patterns from data.",
            "current_practices": "Current practices from research [2].",
            "seasonal_factors": "Seasonal factors [3].",
            "resource_considerations": "Resource considerations [4]."
        }},
        "estimated_duration": {{
            "analysis": "Duration analysis [1].",
            "historical_timeframes": "Historical timeframes from data.",
            "complexity_factors": "Complexity factors [2].",
            "current_standards": "Current standards [3].",
            "dependencies": "Dependencies [4]."
        }},
        "feedback": "Expected community feedback [1] based on trends [2].",
        "citations": [
            {{
                "id": 1,
                "title": "EXACT title from web search Source 1",
                "url": "https://exact-url-from-search-results.com",
                "snippet": "Relevant excerpt that supports the claim"
            }}
        ],
        "metadata": {{}}
    }}

    **CRITICAL:** 
    - Do NOT include markdown formatting (```json)
    - ALWAYS include the "citations" array
    - Use the EXACT URLs and titles from the web search results above
    - Be comprehensive and professional
    '''
    
    try:
        logger.info("Step 5/6: Sending request to Gemini API for analysis...")
        response = model.generate_content(prompt)
        
        cleaned_response = response.text.strip().replace('```json', '').replace('```', '')
        analysis_result = json.loads(cleaned_response)
        
        # Validate that citations array exists
        if 'citations' not in analysis_result:
            logger.warning("Gemini response missing citations array, adding empty array")
            analysis_result['citations'] = []
        
        # Reorder citations after initial parsing
        analysis_result = reorder_citations(analysis_result)

        # NEW: Validate citations to catch fake URLs
        analysis_result = validate_citations(analysis_result)
        
        logger.info("Step 6/6: Successfully generated and parsed analysis report from Gemini.")
        return analysis_result, sources_consulted
    except Exception as e:
        logger.error(f"Error in Gemini analysis: {e}")
        return {"error": True, "message": f"Failed to generate AI analysis: {e}", "citations": []}, 0

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