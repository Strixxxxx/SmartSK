import time
import logging
import json
import re
import google.generativeai as genai
from google.api_core import exceptions

logger = logging.getLogger(__name__)

# --- Centralized Model Names ---
PRIMARY_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.5-flash-lite"

def get_gemini_model(model_name=PRIMARY_MODEL):
    """Factory function to initialize a Gemini model safely."""
    try:
        logger.info(f"Initializing Gemini model: {model_name}")
        return genai.GenerativeModel(model_name)
    except Exception as e:
        logger.error(f"Failed to initialize Gemini model '{model_name}': {e}")
        return None

def call_gemini_with_retry(model, prompt, validation_func, max_retries=5, model_name=PRIMARY_MODEL):
    """
    Calls the Gemini API with fallback logic.
    If PRIMARY_MODEL hits quota, it switches to FALLBACK_MODEL.
    """
    current_model = model
    current_model_name = model_name

    for attempt in range(max_retries):
        logger.info(f"Calling Gemini API ({current_model_name})... Attempt {attempt + 1}/{max_retries}")
        try:
            # Handle list inputs (for images) or string inputs
            if isinstance(prompt, list):
                response = current_model.generate_content(prompt)
            else:
                response = current_model.generate_content(prompt)
            
            # Clean the response to extract JSON
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

        except exceptions.ResourceExhausted as e:
            logger.error(f"Quota Exceeded (429) for model '{current_model_name}'.")
            if current_model_name == PRIMARY_MODEL:
                logger.warning(f"Switching to fallback model: {FALLBACK_MODEL}")
                current_model_name = FALLBACK_MODEL
                current_model = get_gemini_model(FALLBACK_MODEL)
                if not current_model:
                    return None
                # Don't increment attempt, just retry with new model
                continue
            else:
                logger.error("Fallback model also exhausted quota.")
                break

        except json.JSONDecodeError as e:
            logger.warning(f"Attempt {attempt + 1} failed: Could not decode JSON. Error: {e}")
            if 'response' in locals() and hasattr(response, 'text'):
                logger.warning(f"Raw Gemini response text: {response.text}")
        except Exception as e:
            logger.error(f"Attempt {attempt + 1} failed with an unexpected error: {e}")

        # Wait before the next retry
        if attempt < max_retries - 1:
            time.sleep(2) 

    logger.error(f"All {max_retries} attempts to call Gemini API failed.")
    return None
