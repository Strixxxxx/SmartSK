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

def reorder_citations(analysis_result):
    """
    Reorders citations based on their first appearance in the 'trends' list.
    Ensures citation numbers are sequential and correctly mapped for trend analysis.
    """
    if not analysis_result or 'citations' not in analysis_result or 'trends' not in analysis_result:
        return analysis_result

    # Step 1: Build a single string by concatenating description content from the trends list
    full_text = ""
    if isinstance(analysis_result.get('trends'), list):
        for trend in analysis_result['trends']:
            if isinstance(trend, dict) and isinstance(trend.get('description'), str):
                full_text += trend['description'] + " "

    # Step 2: Create a mapping from old ID to new ID based on appearance order
    ordered_citation_ids = []
    old_to_new_id_map = {}
    new_id_counter = 1
    
    original_citations = analysis_result.get('citations', [])
    for match in re.finditer(r'\[(\d+)\]', full_text):
        old_id = int(match.group(1))
        if old_id not in old_to_new_id_map:
            if any(c['id'] == old_id for c in original_citations):
                old_to_new_id_map[old_id] = new_id_counter
                ordered_citation_ids.append(old_id)
                new_id_counter += 1

    if not old_to_new_id_map:
        # Strip markers and empty citations if no valid ones are found
        if isinstance(analysis_result.get('trends'), list):
            for trend in analysis_result['trends']:
                if isinstance(trend, dict) and 'description' in trend:
                    trend['description'] = re.sub(r'\[\d+\]', '', trend['description']).strip()
        analysis_result['citations'] = []
        return analysis_result

    # Step 3: Update the description fields in the trends list with new citation numbers
    if isinstance(analysis_result.get('trends'), list):
        for trend in analysis_result['trends']:
            if isinstance(trend, dict) and 'description' in trend:
                def replace_func(match):
                    old_id = int(match.group(1))
                    return f"[{old_to_new_id_map[old_id]}]" if old_id in old_to_new_id_map else ""
                trend['description'] = re.sub(r'\[(\d+)\]', replace_func, trend['description'])

    # Step 4: Re-create and sort the citations array
    original_citations_map = {c['id']: c for c in original_citations}
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
        logger.error("PSE not configured! Citations will not work.")
        return []
        
    try:
        current_year = datetime.now().year
        target_year = forecast_year if forecast_year else current_year + 1
        
        main_query = f"{query_base} Sangguniang Kabataan Quezon City {target_year} projects"
        results = make_pse_request(main_query)
                
        if results:
            logger.info(f"✓ Found {len(results)} real web results")
            for i, result in enumerate(results[:3], 1):
                logger.info(f"  Result {i}: {result.get('link', 'NO LINK')}")
        else:
            logger.warning("✗ Web search returned 0 results")
        
        return results
        
    except Exception as e:
        print(f"ERROR: Internet search failed: {str(e)[:50]}...")
        return []

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
    
    web_search_results = ""
    if internet_results:
        for i, result in enumerate(internet_results, 1):
            title = result.get('title', 'No Title')
            link = result.get('link', 'No Link')
            snippet = result.get('snippet', 'No Snippet').replace('\n', ' ')
            web_search_results += f"""
===== SOURCE {i} =====
TITLE: {title}
**EXACT URL TO USE IN CITATION {i}**: {link}
SNIPPET: {snippet}
==================

"""

    prompt = f"""
    You are a specialized project trends analyst for Sangguniang Kabataan (SK) in District 5, Quezon City, Philippines.

    **CRITICAL CITATION REQUIREMENTS - READ THIS TWICE:**

    BEFORE YOU START WRITING, UNDERSTAND THIS:
    - Below you will see "SOURCE 1", "SOURCE 2", etc.
    - Each source has "**EXACT URL TO USE IN CITATION X**" 
    - When you write citation [1], you MUST copy the EXACT URL from SOURCE 1
    - When you write citation [2], you MUST copy the EXACT URL from SOURCE 2
    - DO NOT invent URLs like "https://example.com" - these will be REJECTED
    - DO NOT modify the URLs in any way

    **EXAMPLE OF CORRECT CITATION:**
    If SOURCE 1 has:
    **EXACT URL TO USE IN CITATION 1**: https://www.philstar.com/youth-programs-2026

    Then your citations array should have:
    {{
      "id": 1,
      "title": "(exact title from SOURCE 1)",
      "url": "https://www.philstar.com/youth-programs-2026",  <-- COPIED EXACTLY
      "snippet": "(relevant text from SOURCE 1)"
    }}

    **WRONG EXAMPLE (DO NOT DO THIS):**
    {{
      "id": 1,
      "url": "https://example.com/youth-2026"  <-- THIS IS FAKE, THIS WILL BE REJECTED
    }}

    Now, here are your web search results:

    {web_search_results}

    **YOUR TASK:**
    Generate 10 trend ideas for {target_year}. When you cite a claim from the web search results:
    1. Add [1], [2], etc. after the claim
    2. In your "citations" array, use the EXACT URL shown as "**EXACT URL TO USE IN CITATION X**" from that source
    3. Copy the URL character-by-character without changes

    Provide your response in JSON format:
    {{
      "trends": [
        {{
          "id": 1,
          "name": "Trend Name",
          "description": "Description with citation [1] using exact URL from SOURCE 1",
          "confidence": 0.9,
          "trend": "up",
          "category": "EDUCATION",
          "impact": "high"
        }}
      ],
      "citations": [
        {{
          "id": 1,
          "title": "Exact title from SOURCE 1",
          "url": "EXACT URL copied from SOURCE 1",
          "snippet": "Relevant text from SOURCE 1"
        }}
      ],
      "forecast_year": {target_year}
    }}
    """
    
    if historical_data is not None and not historical_data.empty:
        prompt += "\n\n==== PRIMARY DATA (70% weight) ====\nHistorical project data from the database:\n"
        prompt += historical_data.head(15).to_string()
    
    return prompt

def process_gemini_response(response_text, forecast_year=None):
    try:
        # Look for JSON within markdown fences first
        json_match = re.search(r'```json\n(.*?)\n```', response_text, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Fallback to finding the first and last curly brace
            brace_match = re.search(r'({[\s\S]*})', response_text)
            if brace_match:
                json_str = brace_match.group(1)
            else:
                return generate_error_response("Unable to extract JSON from Gemini response.", forecast_year=forecast_year)

        # Clean up the extracted string
        json_str = json_str.strip().replace('\\n', '\n')
        
        data = json.loads(json_str)
        
        if 'trends' not in data or not isinstance(data['trends'], list):
            return generate_error_response("Invalid response format from Gemini AI: 'trends' key is missing or not a list.", forecast_year=forecast_year)
        if 'citations' not in data:
            logger.warning("Gemini response missing citations array, adding empty array")
            data['citations'] = []
        for trend in data['trends']:
            if 'confidence' not in trend or not isinstance(trend['confidence'], (int, float)) or not (0 <= trend['confidence'] <= 1):
                trend['confidence'] = 0.7
        return data
    except json.JSONDecodeError as e:
        return generate_error_response(f"Error processing Gemini response: {e}", forecast_year=forecast_year)
    except Exception as e:
        return generate_error_response(f"An unexpected error occurred while processing the response: {e}", forecast_year=forecast_year)

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

        search_results_text = search_internet_for_trends(forecast_year=forecast_year)
        
        prompt = generate_trends_prompt_with_weights(historical_data, search_results_text, forecast_year)
        
        if not gemini_configured:
            return json.dumps(generate_error_response("Gemini not configured.", forecast_year))
        
        response = model.generate_content(prompt)
        trends_data = process_gemini_response(response.text, forecast_year=forecast_year)
        
        # Reorder citations after initial parsing
        trends_data = reorder_citations(trends_data)

        # NEW: Validate citations to catch fake URLs
        trends_data = validate_citations(trends_data)

        if not trends_data.get('error'):
            categories = get_categories_from_db()
            trends_data['categories'] = categories
            ph_tz = timezone(timedelta(hours=8))
            trends_data['metadata'] = {
                "generated_at": datetime.now(ph_tz).isoformat(),
                "historical_data_available": historical_data is not None,
                "internet_sources_used": len(search_results_text),
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
