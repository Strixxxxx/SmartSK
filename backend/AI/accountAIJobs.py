import sys
import os
import pyodbc
import logging
from datetime import datetime
from dateutil.parser import parse as parse_date
from azure.storage.blob import BlobServiceClient
import google.generativeai as genai
from dotenv import load_dotenv
from PIL import Image
import io
import json
from crypto import decrypt

# Load environment variables from .env file
load_dotenv()

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
DB_SERVER = os.getenv("DB_SERVER")
DB_DATABASE = os.getenv("DB_DATABASE")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_DRIVER = os.getenv('DB_DRIVER', '{ODBC Driver 17 for SQL Server}')

AZURE_CONNECTION_STRING = os.getenv("STORAGE_CONNECTION_STRING_1")
REGISTER_CONTAINER = os.getenv("REGISTER_CONTAINER")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# --- Azure Blob Service Client ---
blob_service_client = None
if AZURE_CONNECTION_STRING:
    try:
        blob_service_client = BlobServiceClient.from_connection_string(AZURE_CONNECTION_STRING)
    except Exception as e:
        logging.error("Failed to create Azure Blob Service Client.", exc_info=True)
        blob_service_client = None

# --- Gemini Model ---
# Initialize the generative model
gemini_model = None
if GEMINI_API_KEY:
    try:
        # Using the latest model as confirmed by search results.
        logging.info("Initializing model: gemini-2.5-flash")
        gemini_model = genai.GenerativeModel('gemini-2.5-flash')
    except Exception as e:
        logging.error("Failed to initialize Gemini model.", exc_info=True)

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
            b.barangayName
        FROM preUserInfo p
        JOIN preUserInfoEx pe ON p.userID = pe.userID
        JOIN barangays b ON p.barangay = b.barangayID
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
        "barangayName": user_data.barangayName
    }

def download_blob_to_memory(container_name, blob_name):
    """Downloads a blob from Azure Storage into memory."""
    if not blob_service_client:
        raise Exception("Azure Blob Service Client is not initialized.")
    try:
        blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)
        if not blob_client.exists():
            logging.error(f"Blob '{blob_name}' not found in container '{container_name}'.")
            return None
        downloader = blob_client.download_blob()
        blob_data = downloader.readall()
        logging.info(f"Successfully downloaded blob '{blob_name}'.")
        return blob_data
    except Exception as e:
        logging.error(f"Failed to download blob '{blob_name}'.", exc_info=True)
        return None

# --- Verification Implementations ---

def verify_id_format(user_id_image_data, user_id_image_data_back):
    """Uses Gemini to identify the type of the user's submitted ID."""
    logging.info("Verifying ID format via Gemini...")
    if not gemini_model:
        return False, "AI Model not initialized."
    
    try:
        user_img = Image.open(io.BytesIO(user_id_image_data))
        user_img_back = Image.open(io.BytesIO(user_id_image_data_back))

        prompt = """
        Analyze the following two images, which represent the front and back of an ID card, and identify the card's type.

        1.  First, determine if it is a 'QCID' (Quezon City ID).
        2.  If it is not a QCID, identify it from this list of other official Philippine IDs: ['Philippine National ID', 'Driver\'s License', 'Passport', 'UMID', 'Postal ID'].
        3.  If the ID does not match any of the types listed above, classify it as 'Unknown'.

        Respond with ONLY a JSON object containing a single key 'id_type' with the identified type as its value.

        Example for a QCID:
        {"id_type": "QCID"}

        Example for a Passport:
        {"id_type": "Passport"}

        Example for an unrecognized card:
        {"id_type": "Unknown"}
        """
        
        response = gemini_model.generate_content([prompt, user_img, user_img_back])
        
        json_str = response.text.strip().replace("```json", "").replace("```", "").strip()
        id_info = json.loads(json_str)
        id_type = id_info.get("id_type", "Unknown")

        if id_type != "Unknown":
            return True, f"ID identified as: {id_type}."
        else:
            return False, "The submitted ID is not a recognized type."
            
    except Exception as e:
        logging.error("Gemini ID format verification failed.", exc_info=True)
        return False, "An error occurred during AI ID format verification."

def extract_id_data(user_id_image_data, user_id_image_data_back):
    """Uses Gemini for OCR to extract structured data from the ID."""
    logging.info("Extracting data from ID via Gemini...")
    if not gemini_model:
        return None
        
    try:
        user_img = Image.open(io.BytesIO(user_id_image_data))
        user_img_back = Image.open(io.BytesIO(user_id_image_data_back))
        
        prompt = """
        Analyze the following two ID card images (front and back) and extract the person's full name (Last Name, First Name, Middle Name), date of birth, and the full address. 
        The address might be on the back of the card.
        Return the data as a JSON object with the keys 'last_name', 'first_name', 'middle_name', 'dob_str', and 'address'.
        For the date of birth, use YYYY/MM/DD format.
        If a field cannot be found, return null for its value.
        The name might be in 'Last, First, Middle' format.
        """
        
        response = gemini_model.generate_content([prompt, user_img, user_img_back])
        
        json_str = response.text.strip().replace("```json", "").replace("```", "").strip()
        
        id_data = json.loads(json_str)
        logging.info(f"Successfully extracted data from ID: {id_data}")
        return id_data
        
    except Exception as e:
        logging.error("Gemini data extraction failed.", exc_info=True)
        return None

def verify_name(form_name, id_data, sk_officials_list_str):
    """
    Verifies the name against the ID and the official SK list.
    1. Normalizes and compares form_name with the name parts from the ID.
    2. Checks if the normalized form_name exists in the SK officials list.
    """
    logging.info("Verifying name...")
    if not form_name or not id_data or not sk_officials_list_str:
        return False, "Missing data for name verification."

    # Normalize the name from the form
    form_name_parts = set(form_name.lower().split())

    # Construct and normalize the name from the ID
    id_first = id_data.get('first_name', '').lower()
    id_middle = id_data.get('middle_name', '').lower()
    id_last = id_data.get('last_name', '').lower()
    
    # Handle cases where middle name might be an initial
    if len(id_middle) == 1:
         id_middle_initial = id_middle
    elif len(id_middle) > 1:
         id_middle_initial = id_middle[0]
    else:
        id_middle_initial = ''

    id_name_full = f"{id_first} {id_middle} {id_last}"
    id_name_with_initial = f"{id_first} {id_middle_initial} {id_last}"
    
    # Check 1: Does the form name reasonably match the ID name?
    # This is a simple check to see if the core parts of the name from the form are present in the ID.
    id_name_parts = set(id_name_full.split())
    if not form_name_parts.issubset(id_name_parts):
        # Retry with middle initial
        id_name_parts_initial = set(id_name_with_initial.split())
        if not form_name_parts.issubset(id_name_parts_initial):
            return False, f"Name on form ('{form_name}') does not match name on ID ('{id_first.title()} {id_last.title()}')."

    # Check 2: Does the name exist in the SK officials list?
    # Normalize the official list for comparison
    official_names = [name.strip().lower() for name in sk_officials_list_str.splitlines() if name.strip()]
    
    form_name_lower = form_name.lower()
    
    if form_name_lower in official_names:
        return True, "Name found in official list."

    # Fuzzy check: see if the form name is a substring of any official name
    for official_name in official_names:
        if form_name_lower in official_name:
            return True, "Name found as a partial match in official list."
            
    return False, "Name not found in the official SK list for the barangay."

def verify_dob(form_dob, id_dob_str):
    """Parses and compares the date of birth from the form and the ID."""
    logging.info("Verifying date of birth...")
    if not form_dob or not id_dob_str:
        return False, "Missing date of birth from form or ID."
    try:
        # form_dob is already a date object from the database
        # id_dob_str is a string like 'YYYY/MM/DD' or similar from the AI
        id_date = parse_date(id_dob_str).date()
        
        if form_dob == id_date:
            return True, "Date of birth matches."
        else:
            return False, f"Date of birth on form ({form_dob}) does not match ID ({id_date})."
    except Exception as e:
        logging.error(f"Could not parse dates for comparison: {e}")
        return False, "Could not parse date of birth from ID."

def verify_barangay(form_barangay, id_address):
    """Checks if the form's barangay is mentioned in the ID's address."""
    logging.info("Verifying barangay...")
    if not form_barangay or not id_address:
        return False, "Missing barangay from form or address from ID."
        
    # Simple, case-insensitive check
    if form_barangay.lower() in id_address.lower():
        return True, "Barangay matches."
    else:
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
            sys.exit(1)
        logging.info(f"Fetched data for user: {user_data['fullName']}")

        # 2. Download necessary files from Azure Blob Storage
        user_id_image_data = download_blob_to_memory(REGISTER_CONTAINER, user_data["attachmentPath"])
        user_id_image_data_back = download_blob_to_memory(REGISTER_CONTAINER, user_data["attachmentPathBack"])
        sk_officials_list_blob_name = f"SK OFFICIAL - {user_data['barangayName']}.txt"
        sk_officials_list_data = download_blob_to_memory(REGISTER_CONTAINER, sk_officials_list_blob_name)

        if not all([user_id_image_data, user_id_image_data_back, sk_officials_list_data]):
             raise Exception("Failed to download one or more required files for verification.")
        
        sk_officials_list_str = sk_officials_list_data.decode('utf-8')

        # 3. Run all verification criteria
        report_lines = []
        all_checks_passed = True

        # Criterion 1: ID Format
        passed, reason = verify_id_format(user_id_image_data, user_id_image_data_back)
        report_lines.append(f"- ID Format Check: {'PASSED' if passed else 'FAILED'}. {reason}")
        if not passed: all_checks_passed = False

        id_data = extract_id_data(user_id_image_data, user_id_image_data_back)
        if not id_data:
            all_checks_passed = False
            report_lines.append("- Data Extraction: FAILED. Could not extract data from ID.")
            id_data = {}
        
        passed, reason = verify_name(user_data["fullName"], id_data, sk_officials_list_str)
        report_lines.append(f"- Name Match: {'PASSED' if passed else 'FAILED'}. {reason}")
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
        cursor.execute("INSERT INTO registrationAudit (userID, verificationReport, attachmentPath, attachmentPathBack) VALUES (?, ?, ?, ?)", user_id, verification_report, user_data["attachmentPath"], user_data["attachmentPathBack"])

        conn.commit()
        logging.info(f"Successfully processed and committed changes for userID: {user_id}")

    except Exception as e:
        logging.error(f"An error occurred during processing for userID: {user_id}", exc_info=True)
        if conn:
            conn.rollback()
        sys.exit(1)
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


