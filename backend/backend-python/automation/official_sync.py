import os
import json
import logging
import pyodbc
from util.crypto import decrypt
from storage.storage import download_blob_to_memory

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
DB_SERVER = os.getenv("DB_SERVER")
DB_DATABASE = os.getenv("DB_DATABASE")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_DRIVER = os.getenv('DB_DRIVER', '{ODBC Driver 17 for SQL Server}')
REGISTER_CONTAINER = os.getenv("REGISTER_CONTAINER", "registrations")

def get_db_connection():
    """Establishes and returns a pyodbc database connection."""
    conn_str = f'DRIVER={DB_DRIVER};SERVER={DB_SERVER};DATABASE={DB_DATABASE};UID={DB_USER};PWD={DB_PASSWORD}'
    return pyodbc.connect(conn_str)

def normalize_name(name):
    """Normalizes name for comparison (lowercase, alphanumeric parts)."""
    if not name: return set()
    clean_name = name.lower().replace('.', ' ').replace(',', ' ')
    return set(clean_name.split())

def sync_user_to_official_list(trigger_user_id, term_id=None):
    """
    When triggered by a new account creation, scans ALL users in the same barangay 
    who have NULL termIDs and attempts to match them against the official list.
    """
    logging.info(f"Triggering global official sync for barangay associated with userID: {trigger_user_id}")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Get the barangay of the trigger user to identify the scope
        cursor.execute("SELECT barangay FROM userInfo WHERE userID = ?", trigger_user_id)
        trigger_row = cursor.fetchone()
        if not trigger_row:
            logging.error(f"Trigger user {trigger_user_id} not found.")
            return False
        
        barangay_id = trigger_row.barangay

        # 2. Get the current term for this barangay if not explicitly passed
        if not term_id:
            cursor.execute("SELECT TOP 1 termID FROM skTerms WHERE barangayID = ? AND isCurrent = 1 ORDER BY termID DESC", barangay_id)
            term_row = cursor.fetchone()
            term_id = term_row.termID if term_row else None

        if not term_id:
            logging.warning(f"No active term found for barangay {barangay_id}. Global sync cannot proceed.")
            return False

        # 3. Get the barangay name for blob retrieval
        cursor.execute("SELECT barangayName FROM barangays WHERE barangayID = ?", barangay_id)
        b_row = cursor.fetchone()
        barangay_name = b_row.barangayName if b_row else None
        
        if not barangay_name:
            logging.error(f"Barangay name not found for ID {barangay_id}")
            return False

        # 4. Download official list from Azure
        blob_name = f"SK OFFICIAL - {barangay_name}.json"
        list_data = download_blob_to_memory(REGISTER_CONTAINER, blob_name)
        if not list_data:
            logging.warning(f"Official list blob '{blob_name}' not found. Cannot perform name matching.")
            return False

        officials_list = json.loads(list_data.decode('utf-8'))
        
        # 5. Find ALL users in this barangay with NULL termID (Self-Healing Scan)
        cursor.execute("""
            SELECT userID, fullName 
            FROM userInfo 
            WHERE barangay = ? AND termID IS NULL AND isArchived = 0
        """, barangay_id)
        
        users_to_sync = cursor.fetchall()
        logging.info(f"Found {len(users_to_sync)} users with NULL termID in {barangay_name}. Starting cross-reference...")

        sync_count = 0
        for user in users_to_sync:
            uid = user.userID
            encrypted_name = user.fullName
            full_name = decrypt(encrypted_name)
            
            if not full_name:
                continue

            user_parts = normalize_name(full_name)
            match_found = False
            
            for official in officials_list:
                off_name = official.get('fullName', '')
                off_parts = normalize_name(off_name)
                
                # Check for overlap in name parts to handle variations in middle initials or suffixes
                if not user_parts or not off_parts:
                    continue
                
                if user_parts.issubset(off_parts) or off_parts.issubset(user_parts):
                    match_found = True
                    break
            
            if match_found:
                logging.info(f"Match confirmed: {full_name} (UID: {uid}) matches official list. Linking to Term {term_id}...")
                cursor.execute("{CALL sp_SyncOfficialTermLink (?, ?)}", uid, term_id)
                sync_count += 1
        
        conn.commit()
        logging.info(f"Global sync complete. {sync_count} users successfully linked to term {term_id}.")
        return True

    except Exception as e:
        logging.error(f"Error in global official sync: {e}")
        if conn: conn.rollback()
        return False
    finally:
        if conn: conn.close()
