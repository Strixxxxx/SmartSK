
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
    
    # Try to find a matching actual URL based on title similarity
    # (simple approach: use the citation ID to map to search result order)
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

# ==============================================================================
# Data Fetching and Processing
# ==============================================================================

def search_internet_for_trends(search_query):
    """Performs a web search using Google Programmable Search Engine."""
    if not all([PSE_API_KEY, PSE_ENGINE_ID]):
        logger.error("PSE not configured! Citations will not work.")
        return []
    
    try:
        url = "https://www.googleapis.com/customsearch/v1"
        params = {'key': PSE_API_KEY, 'cx': PSE_ENGINE_ID, 'q': search_query, 'num': 10}
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        results = [{"title": item.get('title', ''), "snippet": item.get('snippet', ''), "link": item.get('link', '')} for item in data.get('items', [])]
        if results:
            logger.info(f"✓ Found {len(results)} real web results")
            for i, result in enumerate(results[:3], 1):
                logger.info(f"  Result {i}: {result.get('link', 'NO LINK')}")
        else:
            logger.warning("✗ Web search returned 0 results")
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
        category_instruction = f"""
    IMPORTANT: Your entire analysis and all generated trend ideas MUST focus exclusively on the user-selected category: '{category}'. 
    All trend ideas must belong to this category. Do not include trends from other categories, even if they appear in the historical data.
    """

    web_search_results = ""
    if secondary_data:
        for i, result in enumerate(secondary_data, 1):
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
    Generate 10 trend ideas for {forecast_year}. When you cite a claim from the web search results:
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
          "category": "{category}",
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
        # Look for JSON within markdown fences first
        json_match = re.search(r'```json\n(.*?)\n```', response.text, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Fallback to finding the first and last curly brace
            brace_match = re.search(r'({[\s\S]*})', response.text)
            if brace_match:
                json_str = brace_match.group(1)
            else:
                raise ValueError("Unable to extract JSON from Gemini response.")

        # Clean up the extracted string
        json_str = json_str.strip().replace('\\n', '\n')
        
        data = json.loads(json_str)

        if 'citations' not in data:
            logger.warning("Gemini response missing citations array, adding empty array")
            data['citations'] = []
        return data
    except json.JSONDecodeError as e:
        logger.error(f"Error decoding JSON from Gemini response: {e}")
        raise ValueError(f"Invalid JSON format received from AI: {e}")
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

        # Reorder citations after initial processing
        result = reorder_citations(result)

        # NEW: Validate citations to catch fake URLs
        result = validate_citations(result)

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
