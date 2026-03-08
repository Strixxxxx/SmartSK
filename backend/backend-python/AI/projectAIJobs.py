import sys
import os
import pyodbc
import logging
from datetime import datetime
import google.genai as genai
from dotenv import load_dotenv
import io
import json
from crypto import decrypt, encrypt
from pypdf import PdfReader
from docx import Document
from storage.storage import download_blob_to_memory

# Load environment variables from .env file
load_dotenv()

# --- Configuration ---
DB_SERVER = os.getenv("DB_SERVER")
DB_DATABASE = os.getenv("DB_DATABASE")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_DRIVER = os.getenv('DB_DRIVER', '{ODBC Driver 17 for SQL Server}')

DOCS_CONTAINER = os.getenv("DOCS_CONTAINER")
AIPROJ_CONTAINER = os.getenv("AIPROJ_CONTAINER")

# genai.configure is now handled in get_gemini_client() in gemini_utils.py

# --- Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Gemini Model Utilities ---
from gemini_utils import call_gemini_with_retry, PRIMARY_MODEL, FALLBACK_MODEL

def analyze_proposal_with_ai(document_text, rules_text):
    """Uses Gemini to analyze the proposal against the rules with fallback support."""
    logging.info("Analyzing project proposal with Gemini AI...")
    
    prompt = f"""
        As an AI assistant for an SK Council, your task is to review a project proposal based on a given set of rules.

        **RULES/CRITERIA:**
        ---
        {rules_text}
        ---

        **PROJECT PROPOSAL DOCUMENT TEXT:**
        ---
        {document_text}
        ---

        **INSTRUCTIONS:**
        1.  Carefully read the rules and the project proposal.
        2.  Determine if the proposal complies with ALL the rules.
        3.  Generate a brief, neutral, one-paragraph summary of your findings.
        4.  List any specific rules that were violated. If there are no violations, state that all rules were met.
        5.  Provide a final decision: 'approved' if it complies with all rules, 'rejected' otherwise.

        Respond with ONLY a JSON object with the following keys:
        - "decision": "approved" or "rejected"
        - "summary": Your one-paragraph summary.
        - "violations": A list of strings, where each string is a violated rule. An empty list [] if no violations.
    """
    
    # Validation function for proposal analysis
    def is_valid_proposal_response(data):
        return 'decision' in data and 'summary' in data and 'violations' in data

    # Use the retry utility
    analysis_result = call_gemini_with_retry(
        prompt=prompt, 
        validation_func=is_valid_proposal_response, 
        model_name=PRIMARY_MODEL
    )

    if analysis_result:
        logging.info(f"Successfully received analysis from AI: {analysis_result.get('decision')}")
        return analysis_result, "Analysis complete."
    else:
        return None, "An error occurred during AI analysis or quota reached."

# --- Main Execution Logic ---

def main(project_id):
    """
    Main function to process a project proposal submission.
    """
    logging.info(f"Starting AI processing for projectID: {project_id}")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Get project data
        project_data = get_project_data(cursor, project_id)
        if not project_data:
            logging.error(f"No data found for projectID: {project_id}. Exiting.")
            sys.exit(1)
        
        file_path = project_data.get("filePath")
        barangay_name = project_data["barangayName"]
        logging.info(f"Fetched data for projectID: {project_id} in Barangay: {barangay_name}")

        if not file_path:
            logging.error(f"Project {project_id} has no associated file path in the database. Cannot proceed.")
            cursor.execute(
                "UPDATE projects SET status = ?, remarks = ? WHERE projectID = ?",
                4, "AI processing failed: Project submission is missing the document file path.", project_id
            )
            conn.commit()
            sys.exit(1)

        # 2. Read document and rules file from Azure Blob Storage
        project_document_data = download_blob_to_memory(DOCS_CONTAINER, file_path)
        
        rules_blob_name = f"PROJECT RULES - {barangay_name}.txt"
        rules_data = download_blob_to_memory(AIPROJ_CONTAINER, rules_blob_name)

        if not project_document_data:
            raise Exception(f"Failed to read project document for projectID: {project_id}.")
        
        if not rules_data:
            # If rules file doesn't exist, we can't proceed.
            logging.warning(f"No rules file found for Barangay '{barangay_name}'. Skipping AI analysis.")
            # We can decide to auto-reject or just log and exit. Let's log and exit for now.
            # Or, insert a specific report.
            report = "AI processing skipped: No rules file found for the barangay."
            decision = "rejected" # Or a neutral status like 'needs_manual_review'
            cursor.execute(
                "INSERT INTO projectAudit (projectID, verificationReport, decision) VALUES (?, ?, ?)",
                project_id, report, decision
            )
            conn.commit()
            logging.info("Logged skipped analysis to projectAudit.")
            sys.exit(0)

        rules_text = rules_data.decode('utf-8')

        # 3. Extract text from the document
        document_text = extract_text_from_document(project_document_data, file_path)
        if not document_text:
            raise Exception(f"Could not extract text from document for projectID: {project_id}.")

        # 4. Perform AI analysis
        analysis, message = analyze_proposal_with_ai(document_text, rules_text)
        
        if not analysis:
            # Create a failure report
            report = f"AI analysis failed for projectID {project_id}. Reason: {message}"
            decision = "rejected"
        else:
            # Format a human-readable report from the AI's JSON output
            decision = analysis.get("decision", "rejected")
            summary = analysis.get("summary", "No summary provided.")
            violations = analysis.get("violations", [])
            
            report = f"AI Verification Summary: {summary}\n\n"
            if violations:
                report += "Violations Found:\n"
                for v in violations:
                    report += f"- {v}\n"
            else:
                report += "Compliance: All rules were met.\n"
            report += f"\nFinal AI Decision: {decision.capitalize()}"

        # 5. Save the audit report to the database
        logging.info(f"Inserting audit record for projectID: {project_id}")
        cursor.execute(
            "INSERT INTO projectAudit (projectID, verificationReport, decision) VALUES (?, ?, ?)",
            project_id, report, decision
        )
        
        # 6. Update the project status and remarks based on AI decision
        status_map = {'approved': 3, 'rejected': 4}
        new_status_id = status_map.get(decision, 4) # Default to rejected

        # Encrypt the report to be stored as remarks
        encrypted_report = encrypt(report)

        # Encrypt the reviewer name
        reviewer_name = "Google Gemini AI"
        encrypted_reviewer_name = encrypt(reviewer_name)

        logging.info(f"Updating project status for projectID {project_id} to status ID {new_status_id}, setting remarks, and reviewer.")
        cursor.execute(
            "UPDATE projects SET status = ?, remarks = ?, reviewedBy = ? WHERE projectID = ?",
            new_status_id, encrypted_report, encrypted_reviewer_name, project_id
        )

        conn.commit()
        logging.info(f"Successfully processed and committed changes for projectID: {project_id}")

    except Exception as e:
        logging.error(f"An error occurred during processing for projectID: {project_id}", exc_info=True)
        if conn:
            conn.rollback()
        sys.exit(1)
    finally:
        if conn:
            conn.close()
            logging.info("Database connection closed.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        logging.error("Usage: python projectAIJobs.py <projectID>")
        sys.exit(1)
    
    try:
        project_id_arg = int(sys.argv[1])
        main(project_id_arg)
        sys.exit(0)
    except ValueError:
        logging.error(f"Invalid projectID provided: {sys.argv[1]}. Must be an integer.")
        sys.exit(1)
    except Exception as e:
        sys.exit(1)
