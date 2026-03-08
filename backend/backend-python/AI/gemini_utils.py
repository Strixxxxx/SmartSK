import time
import logging
import json
import re
import os
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# --- Centralized Model Names ---
PRIMARY_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.5-flash-lite"

_client = None

def get_gemini_client():
    """Returns a singleton genai.Client instance."""
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.error("GEMINI_API_KEY not found in environment variables.")
            return None
        _client = genai.Client(api_key=api_key)
    return _client

def call_gemini_with_retry(prompt, validation_func, max_retries=5, model_name=PRIMARY_MODEL):
    """
    Calls the Gemini API with fallback logic using the new google-genai Client.
    If PRIMARY_MODEL hits quota, it switches to FALLBACK_MODEL.
    """
    client = get_gemini_client()
    if not client:
        return None

    current_model_name = model_name

    for attempt in range(max_retries):
        logger.info(f"Calling Gemini API ({current_model_name})... Attempt {attempt + 1}/{max_retries}")
        try:
            # Generate content using the new client API
            response = client.models.generate_content(
                model=current_model_name,
                contents=prompt
            )
            
            # Clean the response to extract JSON
            if not response or not response.text:
                logger.warning(f"Attempt {attempt + 1} failed: Empty response from Gemini.")
                continue

            cleaned_response = response.text.strip()
            if cleaned_response.startswith('```json'):
                cleaned_response = re.sub(r'^```json\s*', '', cleaned_response)
            if cleaned_response.endswith('```'):
                cleaned_response = re.sub(r'\s*```$', '', cleaned_response)

            # Try to parse the JSON
            parsed_json = json.loads(cleaned_response)

            # Validate the parsed JSON using the provided function
            if validation_func(parsed_json):
                logger.info(f"Gemini response validated successfully on attempt {attempt + 1}.")
                return parsed_json
            else:
                logger.warning(f"Attempt {attempt + 1} failed: Response JSON failed validation.")

        except Exception as e:
            error_msg = str(e).lower()
            if "429" in error_msg or "quota" in error_msg or "resource_exhausted" in error_msg:
                logger.error(f"Quota Exceeded (429) for model '{current_model_name}'.")
                if current_model_name == PRIMARY_MODEL:
                    logger.warning(f"Switching to fallback model: {FALLBACK_MODEL}")
                    current_model_name = FALLBACK_MODEL
                    # Don't increment attempt, just retry with new model
                    continue
                else:
                    logger.error("Fallback model also exhausted quota.")
                    break
            
            logger.error(f"Attempt {attempt + 1} failed with an unexpected error: {e}")

        # Wait before the next retry
        if attempt < max_retries - 1:
            time.sleep(2) 

    logger.error(f"All {max_retries} attempts to call Gemini API failed.")
    return None
