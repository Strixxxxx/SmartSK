import sys
import os
import pyodbc
import logging
from datetime import datetime
from dateutil.parser import parse as parse_date
import google.generativeai as genai
from dotenv import load_dotenv
from PIL import Image
import io
import json
from crypto import decrypt
import traceback
import re
from google.api_core import exceptions
from gemini_utils import get_gemini_model, PRIMARY_MODEL, FALLBACK_MODEL

# Load environment variables explicitly from the backend directory root
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(dotenv_path=dotenv_path)
logging.info(f"Attempting to load .env file from: {os.path.abspath(dotenv_path)}")

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
DB_SERVER = os.getenv("DB_SERVER")
DB_DATABASE = os.getenv("DB_DATABASE")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_DRIVER = os.getenv('DB_DRIVER', '{ODBC Driver 17 for SQL Server}')

BASE_STORAGE_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'backend-node', 'File_Storage')
REGISTER_CONTAINER = os.getenv("REGISTER_CONTAINER")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# --- Centralized Constants ---
ROLE_NAME_MAP = {
    "SKC": "SK Chairperson",
    "SKS": "SK Secretary",
    "SKT": "SK Treasurer",
    "SKK1": "SK Kagawad I",
    "SKK2": "SK Kagawad II",
    "SKK3": "SK Kagawad III",
    "SKK4": "SK Kagawad IV",
    "SKK5": "SK Kagawad V",
    "SKK6": "SK Kagawad VI",
    "SKK7": "SK Kagawad VII"
}

# --- Helper Functions ---

def get_db_connection():
    """Establishes and returns a pyodbc database connection."""
    if not all([DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD]):
        raise Exception("Database credentials are not fully configured.")
    conn_str = f'DRIVER={DB_DRIVER};SERVER={DB_SERVER};DATABASE={DB_DATABASE};UID={DB_USER};PWD={DB_PASSWORD}'
    return pyodbc.connect(conn_str)

def get_user_data(cursor, user_id):
    """Fetches comprehensive user data from the database."""
    query = """
        SELECT 
            p.fullName, 
            p.emailAddress, 
            pe.attachmentPath,
            pe.attachmentPathBack,
            pe.dateOfBirth,
            b.barangayName,
            r.roleName
        FROM preUserInfo p
        JOIN preUserInfoEx pe ON p.userID = pe.userID
        JOIN barangays b ON p.barangay = b.barangayID
        JOIN roles r ON p.position = r.roleID
        WHERE p.userID = ?
    """
    cursor.execute(query, user_id)
    user_data = cursor.fetchone()
    if not user_data:
        return None
    
    # Decrypt PII before returning
    decrypted_full_name = decrypt(user_data.fullName)
    decrypted_email = decrypt(user_data.emailAddress)

    if not decrypted_full_name or not decrypted_email:
        logging.error(f"Failed to decrypt data for userID: {user_id}")
        return None

    return {
        "fullName": decrypted_full_name,
        "emailAddress": decrypted_email,
        "attachmentPath": user_data.attachmentPath,
        "attachmentPathBack": user_data.attachmentPathBack,
        "dateOfBirth": user_data.dateOfBirth,
        "barangayName": user_data.barangayName,
        "roleName": user_data.roleName
    }

def read_local_file_to_memory(container_name, file_name):
    """Reads a file from the local file system into memory."""
    if not container_name or not file_name:
        raise ValueError("Container name and file name are required.")
    
    file_path = os.path.join(BASE_STORAGE_PATH, container_name, file_name)
    
    try:
        with open(file_path, 'rb') as f:
            file_data = f.read()
        logging.info(f"Successfully read file '{file_name}' from '{container_name}'.")
        return file_data
    except FileNotFoundError:
        logging.error(f"File '{file_name}' not found in container '{container_name}' at path '{file_path}'.")
        return None
    except Exception as e:
        logging.error(f"Failed to read file '{file_name}'.", exc_info=True)
        return None

# --- Verification Implementations ---

def analyze_id_card(id_image_data, id_back_image_data):
    """
    Consolidated function to identify ID and extract data using Gemini.
    Tries PRIMARY_MODEL first, falls back to FALLBACK_MODEL on quota exceeded.
    """
    logging.info("Analyzing ID card (Identification + OCR) via Gemini...")
    
    prompt = """
    You are an expert document analyzer for the Sangguniang Kabataan (SK). 
    Your task is to identify and extract data from the provided images (front and back of an ID card).

    1. IDENTIFICATION:
       - Determine the type of ID card (e.g., PASSPORT, DRIVERS_LICENSE, PRC_ID, QCID, NATIONAL_ID, PHILHEALTH_ID).
    
    2. DATA EXTRACTION:
       - Extract First Name, Middle Name, Last Name.
       - Extract Date of Birth exactly as shown (but YYYY/MM/DD preferred).
       - Extract the Full Address (look at both front and back images).

    Respond ONLY with a flat JSON object in this format:
    {
      "id_type": "TYPE_NAME",
      "first_name": "...",
      "middle_name": "...",
      "last_name": "...",
      "dob_str": "...",
      "address": "..."
    }
    """
    
    user_img = {"mime_type": "image/jpeg", "data": id_image_data}
    user_img_back = {"mime_type": "image/jpeg", "data": id_back_image_data}
    
    models_to_try = [PRIMARY_MODEL, FALLBACK_MODEL]
    
    for model_name in models_to_try:
        try:
            model = get_gemini_model(model_name)
            if not model:
                continue
                
            logging.info(f"Using model: {model_name}")
            response = model.generate_content([prompt, user_img, user_img_back])
            
            # Extract JSON from potential code block
            json_str = response.text.strip()
            if json_str.startswith("```json"):
                json_str = re.sub(r'^```json\s*', '', json_str)
            if json_str.endswith("```"):
                json_str = re.sub(r'\s*```$', '', json_str)
            
            return json.loads(json_str)
            
        except exceptions.ResourceExhausted as e:
            logging.error(f"Quota Exceeded (429) for model '{model_name}'.")
            if model_name == PRIMARY_MODEL:
                logging.warning(f"Retrying with fallback model: {FALLBACK_MODEL}...")
                continue
            else:
                return {"error": "QUOTA_EXCEEDED"}
                
        except Exception as e:
            error_msg = str(e)
            logging.error("--- AI API ERROR DIAGNOSTICS ---")
            logging.error(f"Error Type: {type(e).__name__}")
            logging.error(f"Error Message: {error_msg}")
            logging.error("Full Traceback:")
            logging.error(traceback.format_exc())
            
            if "429" in error_msg or "quota" in error_msg.lower():
                logging.error(f"Verdict: Gemini API Quota Exceeded (429) for {model_name}.")
                if model_name == PRIMARY_MODEL:
                    continue
                return {"error": "QUOTA_EXCEEDED"}
            
            logging.error(f"Verdict: Gemini ID analysis failed for {model_name}.")
            return {"error": "AI processing failed."}
            
    return {"error": "AI processing failed."}

def normalize_name_to_parts(name):
    """Normalizes name by lowercasing and splitting into alphanumeric parts."""
    if not name: return set()
    # Remove dots and commas
    clean_name = name.lower().replace('.', ' ').replace(',', ' ')
    return set(clean_name.split())

def verify_name_and_role(form_name, selected_role, id_data, sk_officials_list_str):
    """
    Verifies the name against the ID and the official SK list.
    1. Compares form_name with parts from the ID.
    2. Checks if form_name parts are a subset of any name in the SK list for the selected role.
    """
    full_role_name = ROLE_NAME_MAP.get(selected_role, selected_role)
    logging.info(f"Verifying name and role (Selected: {full_role_name})...")
    if not all([form_name, selected_role, id_data, sk_officials_list_str]):
        return False, "Missing data for name/role verification."

    # Normalize names to sets of words
    form_parts = normalize_name_to_parts(form_name)
    logging.info(f"[DEBUG vName] Form Name Parts: {form_parts}")
    
    # Construct name from ID
    id_first = id_data.get('first_name', '').lower()
    id_middle = id_data.get('middle_name', '').lower()
    id_last = id_data.get('last_name', '').lower()
    id_parts = normalize_name_to_parts(f"{id_first} {id_middle} {id_last}")
    
    # Handle middle initial case for ID comparison
    id_parts_with_initial = id_parts.copy()
    if id_middle:
        id_parts_with_initial.add(id_middle[0])
    logging.info(f"[DEBUG vName] ID Name Parts (with initial): {id_parts_with_initial}")

    # Check 1: Does the form name match the ID?
    if not form_parts.issubset(id_parts_with_initial):
        missing = form_parts - id_parts_with_initial
        logging.warning(f"[DEBUG vName] ID Match FAILED. Missing parts from ID: {missing}")
        return False, f"Name on form ('{form_name}') does not match name on ID ('{id_first.title()} {id_last.title()}')."
    
    logging.info("[DEBUG vName] ID Match: PASSED")

    # Check 2: Does the name match the SK Official List for the selected role?
    try:
        officials_json = json.loads(sk_officials_list_str)
        # Filter candidates by the requested role abbreviation (e.g. 'SKS')
        candidates = [item for item in officials_json if item.get('position') == selected_role]
        logging.info(f"[DEBUG vName] Found {len(candidates)} candidates for role {full_role_name} in Official List.")
        
        # Check each candidate matching the role
        for candidate in candidates:
            official_name = candidate.get('fullName', '')
            official_parts = normalize_name_to_parts(official_name)
            logging.info(f"[DEBUG vName] Checking against Official entry: '{official_name}' -> Parts: {official_parts}")
            
            # If all parts of the form name (e.g. 'Yasmien', 'Ando') exist in the official list name (e.g. 'Yasmien', 'M', 'Ando')
            if form_parts.issubset(official_parts):
                logging.info(f"[DEBUG vName] Official List Match FOUND for role {full_role_name}.")
                return True, f"Name found in official list for position {full_role_name}."
            else:
                missing = form_parts - official_parts
                logging.info(f"[DEBUG vName] Candidate mismatch. Missing parts: {missing}")
        
        # Special case: check if the name exists but for a different role
        logging.info(f"[DEBUG vName] No match for requested role {full_role_name}. Checking other roles for same name...")
        all_other_officials = [item for item in officials_json if item.get('position') != selected_role]
        for official in all_other_officials:
            official_parts = normalize_name_to_parts(official.get('fullName', ''))
            if form_parts.issubset(official_parts):
                 other_role_code = official.get('position', 'Unknown')
                 other_role_name = ROLE_NAME_MAP.get(other_role_code, other_role_code)
                 logging.warning(f"[DEBUG vName] Name exists as a DIFFERENT position: '{other_role_name}'")
                 return False, f"Name exists in official list but is registered as '{other_role_name}', not '{full_role_name}'."
                 
    except (json.JSONDecodeError, TypeError):
        logging.error("[DEBUG vName] Failed to parse official list JSON.")
        return False, "System error: Could not verify official list."

    logging.warning(f"[DEBUG vName] No match found for {full_role_name} in entire Official List.")
    return False, f"Name not found in the official SK list for the requested position '{full_role_name}'."

def verify_dob(form_dob, id_dob_str):
    """Parses and compares the date of birth from the form and the ID."""
    logging.info("Verifying date of birth...")
    if not form_dob or not id_dob_str:
        return False, "Missing date of birth from form or ID."
    try:
        # form_dob is already a date object from the database
        # id_dob_str is a string like 'YYYY/MM/DD' or similar from the AI
        logging.info(f"[DEBUG vDOB] Comparing Form DOB '{form_dob}' with ID DOB Str '{id_dob_str}'")
        id_date = parse_date(id_dob_str).date()
        logging.info(f"[DEBUG vDOB] Parsed ID Date: '{id_date}'")
        
        if form_dob == id_date:
            return True, "Date of birth matches."
        else:
            logging.warning(f"[DEBUG vDOB] Mismatch: {form_dob} != {id_date}")
            return False, f"Date of birth on form ({form_dob}) does not match ID ({id_date})."
    except Exception as e:
        logging.error(f"[DEBUG vDOB] Parse Error: {e}")
        return False, "Could not parse date of birth from ID."

def verify_barangay(form_barangay, id_address):
    """Checks if the form's barangay is mentioned in the ID's address."""
    logging.info("Verifying barangay...")
    if not form_barangay or not id_address:
        return False, "Missing barangay from form or address from ID."
        
    # Simple, case-insensitive check
    logging.info(f"[DEBUG vBrgy] Checking if '{form_barangay}' exists in ID Address: '{id_address}'")
    if form_barangay.lower() in id_address.lower():
        logging.info("[DEBUG vBrgy] Barangay Match FOUND.")
        return True, "Barangay matches."
    else:
        logging.warning("[DEBUG vBrgy] Barangay NOT found in address.")
        return False, f"Barangay on form ('{form_barangay}') not found in address on ID."

# --- Main Execution Logic ---

def main(user_id):
    """
    Main function to process a user registration.
    Fetches user data, runs AI verification, and updates the database.
    """
    logging.info(f"Starting AI processing for userID: {user_id}")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        user_data = get_user_data(cursor, user_id)
        if not user_data:
            logging.error(f"No data found for userID: {user_id}. Exiting.")
            raise RuntimeError(f"No data found for userID: {user_id}.")
        logging.info(f"Fetched data for user: {user_data['fullName']}")

        # 2. Read necessary files from local storage
        user_id_image_data = read_local_file_to_memory(REGISTER_CONTAINER, user_data["attachmentPath"])
        user_id_image_data_back = read_local_file_to_memory(REGISTER_CONTAINER, user_data["attachmentPathBack"])
        sk_officials_list_blob_name = f"SK OFFICIAL - {user_data['barangayName']}.json"
        sk_officials_list_data = read_local_file_to_memory(REGISTER_CONTAINER, sk_officials_list_blob_name)

        if not all([user_id_image_data, user_id_image_data_back, sk_officials_list_data]):
             raise Exception("Failed to read one or more required files for verification.")
        
        sk_officials_list_str = sk_officials_list_data.decode('utf-8')

        # 3. Run all verification criteria
        report_lines = []
        all_checks_passed = True

        # Criterion: ID Analysis (Identification + OCR)
        id_analysis_result = analyze_id_card(user_id_image_data, user_id_image_data_back)
        
        if "error" in id_analysis_result:
            all_checks_passed = False
            if id_analysis_result["error"] == "QUOTA_EXCEEDED":
                error_msg = "AI Quota Exceeded. The system is currently busy or has reached its daily limit. Please try again later or contact an administrator for manual approval."
                report_lines.append(f"- AI Service: FAILED. {error_msg}")
            else:
                report_lines.append(f"- AI Service: FAILED. {id_analysis_result['error']}")
            
            # Since the core AI analysis failed, we can't proceed with other checks
            id_data = {}
        else:
            id_data = id_analysis_result
            id_type = id_data.get("id_type", "Unknown")
            
            passed = id_type != "Unknown"
            report_lines.append(f"- ID Format Check: {'PASSED' if passed else 'FAILED'}. ID identified as: {id_type}.")
            if not passed: all_checks_passed = False
            
            # Now run the other checks with the extracted data
            passed, reason = verify_name_and_role(user_data["fullName"], user_data["roleName"], id_data, sk_officials_list_str)
            report_lines.append(f"- Name & Role Match: {'PASSED' if passed else 'FAILED'}. {reason}")
            if not passed: all_checks_passed = False

            passed, reason = verify_dob(user_data["dateOfBirth"], id_data.get("dob_str"))
            report_lines.append(f"- Date of Birth Match: {'PASSED' if passed else 'FAILED'}. {reason}")
            if not passed: all_checks_passed = False

            passed, reason = verify_barangay(user_data["barangayName"], id_data.get("address"))
            report_lines.append(f"- Barangay Match: {'PASSED' if passed else 'FAILED'}. {reason}")
            if not passed: all_checks_passed = False

        decision = 'approved' if all_checks_passed else 'rejected'
        final_rejection_reason = next((line.split('. ')[1] for line in report_lines if "FAILED" in line), "Multiple criteria failed.")
        
        verification_report = f"Verification Report for user '{user_data['fullName']}':\n" + "\n".join(report_lines)
        verification_report += f"\nFINAL DECISION: {decision.capitalize()}."
        
        logging.info(f"AI decision for userID {user_id}: {decision}")
        logging.debug(verification_report)

        if decision == 'approved':
            logging.info(f"Executing sp_ApprovePendingUser for userID: {user_id}")
            cursor.execute("{CALL sp_ApprovePendingUser (?)}", user_id)
        else:
            logging.info(f"Updating status to 'rejected' for userID: {user_id}")
            cursor.execute("UPDATE preUserInfoEx SET status = ?, rejectionReason = ? WHERE userID = ?", 'rejected', final_rejection_reason, user_id)

        logging.info(f"Inserting audit record for userID: {user_id}")
        cursor.execute(
            "INSERT INTO registrationAudit (userID, verificationReport, attachmentPath, attachmentPathBack, isApprove) VALUES (?, ?, ?, ?, ?)", 
            user_id, 
            verification_report, 
            user_data["attachmentPath"], 
            user_data["attachmentPathBack"],
            all_checks_passed
        )

        conn.commit()
        logging.info(f"Successfully processed and committed changes for userID: {user_id}")

    except Exception as e:
        logging.error(f"An error occurred during processing for userID: {user_id}", exc_info=True)
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            conn.close()
            logging.info("Database connection closed.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        logging.error("Usage: python accountAIJobs.py <userID>")
        sys.exit(1)
    
    try:
        user_id_arg = int(sys.argv[1])
        main(user_id_arg)
        sys.exit(0)
    except ValueError:
        logging.error(f"Invalid userID provided: {sys.argv[1]}. Must be an integer.")
        sys.exit(1)
    except Exception as e:
        sys.exit(1)


