import os
import sys
import json
import logging
from datetime import datetime
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

        formatted_results = ""
        for i, item in enumerate(items, 1):
            title = item.get('title', 'No Title')
            link = item.get('link', 'No Link')
            snippet = item.get('snippet', 'No Snippet').replace('\n', ' ')
            formatted_results += f"""
===== SOURCE {i} =====
TITLE: {title}
**EXACT URL TO USE IN CITATION {i}**: {link}
SNIPPET: {snippet}
==================

"""
        
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
    structure_description["citations"] = [{"id": 1, "title": "Source Title", "url": "https://example.com", "snippet": "Relevant snippet"}]
    structure_description["metadata"] = {}

    prompt = f'''
    You are a senior data analyst for a Sangguniang Kabataan (SK) council of District 5 Quezon City, providing a customized predictive analysis with VERIFIABLE CITATIONS.
    Your task is to generate a professional analysis report in JSON format based on the user's request.
    The analysis should be based on the provided historical data and, if available, web search results.

    **CRITICAL CITATION REQUIREMENTS - READ CAREFULLY:**
    1. You MUST use the EXACT URLs provided in the web search results below.
    2. DO NOT generate fake URLs like "https://example.com" or "invalid".
    3. Each citation in the final `citations` array MUST have a real URL from the search results (copy it exactly), the exact title, and a relevant snippet.
    4. If you reference information from "Source 1" in the web search results, your citation [1] must use the EXACT link provided for Source 1.
    5. Number citations [1], [2], [3] in order of first appearance in your analysis text.
    6. VERIFY every URL you include is from the actual web search results provided below.

    **1. Web Search Results (Context - CITE THESE WITH EXACT URLs):**
    CRITICAL: When you cite a source below, you MUST:
    - Use the EXACT "Link:" provided for that source.
    - Do NOT make up URLs like "https://example.com".
    - Copy the link character-for-character from the Source below.
    {web_search_results}

    **2. Historical Data Preview:**
    {data_preview}

    **3. JSON Output Requirements:**
    Generate a JSON object containing ONLY the fields requested in the structure below. Include citations [1], [2], etc. in all text fields where you reference web search results.
    Respond ONLY with a valid JSON object, no extra text or markdown.

    {json.dumps(structure_description, indent=2)}
    '''
    
    try:
        logger.info("Step 5/6: Sending request to Gemini API for analysis...")
        response = model.generate_content(prompt)
        cleaned_response = response.text.strip().replace('```json', '').replace('```', '')
        analysis_result = json.loads(cleaned_response)
        
        if 'citations' not in analysis_result:
            logger.warning("Gemini response missing citations array, adding empty array")
            analysis_result['citations'] = []

        # Reorder citations after initial parsing
        analysis_result = reorder_citations(analysis_result)

        # NEW: Try to fix hallucinated citations
        analysis_result = verify_and_fix_citations(analysis_result, web_search_results)

        # NEW: Validate citations to catch fake URLs
        analysis_result = validate_citations(analysis_result)

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