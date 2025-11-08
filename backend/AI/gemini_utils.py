
import time
import logging
import json
import re
import google.generativeai as genai

logger = logging.getLogger(__name__)

def call_gemini_with_retry(model, prompt, validation_func, max_retries=5):
    """
    Calls the Gemini API with a given prompt and validates the response using a retry mechanism.

    Args:
        model: The configured Gemini GenerativeModel instance.
        prompt (str): The prompt to send to the API.
        validation_func (function): A function that takes the parsed JSON and returns True if valid, False otherwise.
        max_retries (int): The maximum number of times to retry.

    Returns:
        dict: The validated JSON response, or None if all retries fail.
    """
    for attempt in range(max_retries):
        logger.info(f"Calling Gemini API... Attempt {attempt + 1}/{max_retries}")
        try:
            response = model.generate_content(prompt)
            
            # Clean the response to extract JSON
            cleaned_response = response.text.strip()
            if cleaned_response.startswith('```json'):
                cleaned_response = cleaned_response[len('```json'):].strip()
            if cleaned_response.endswith('```'):
                cleaned_response = cleaned_response[:-len('```')].strip()

            # Try to parse the JSON
            parsed_json = json.loads(cleaned_response)

            # Validate the parsed JSON using the provided function
            if validation_func(parsed_json):
                logger.info(f"Gemini response validated successfully on attempt {attempt + 1}.")
                return parsed_json
            else:
                logger.warning(f"Attempt {attempt + 1} failed: Response JSON failed validation.")

        except json.JSONDecodeError as e:
            logger.warning(f"Attempt {attempt} failed: Could not decode JSON. Error: {e}")
            # Log the raw response for debugging
            if 'response' in locals() and hasattr(response, 'text'):
                logger.warning(f"Raw Gemini response text: {response.text}")
        except Exception as e:
            logger.warning(f"Attempt {attempt + 1} failed with an unexpected error: {e}")

        # Wait before the next retry
        if attempt < max_retries - 1:
            time.sleep(2) # Simple backoff

    logger.error(f"All {max_retries} attempts to call Gemini API failed to return a valid response.")
    return None
