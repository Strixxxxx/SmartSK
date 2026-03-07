import os
import pyodbc
import openpyxl
from datetime import datetime
import logging

# Set up logging
logger = logging.getLogger(__name__)

# DB Config (assuming env vars are set)
DB_SERVER = os.getenv("DB_SERVER")
DB_DATABASE = os.getenv("DB_DATABASE")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_DRIVER = os.getenv('DB_DRIVER', '{ODBC Driver 17 for SQL Server}')

def get_conn():
    conn_str = f'DRIVER={DB_DRIVER};SERVER={DB_SERVER};DATABASE={DB_DATABASE};UID={DB_USER};PWD={DB_PASSWORD}'
    return pyodbc.connect(conn_str)

def sync_excel_from_db(batch_id):
    """
    Syncs a specific project's Excel file from the database entries.
    """
    conn = get_conn()
    try:
        cursor = conn.cursor()
        
        # 1. Fetch Batch Info
        cursor.execute("SELECT projType, targetYear, barangayID FROM projectBatch WHERE batchID = ?", batch_id)
        batch = cursor.fetchone()
        if not batch:
            logger.error(f"Batch {batch_id} not found.")
            return False
        
        proj_type, target_year, barangay_id = batch
        abbr = "SB" if barangay_id == 1 else "NN"
        
        # 2. Construct File Path
        # Target: backend-node/File_Storage/documents/projects/[Type]_[Abbr]_[Year].xlsx
        # current file is in backend-python/AI/
        base_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        file_name = f"{proj_type}_{abbr}_{target_year}.xlsx"
        file_path = os.path.join(base_path, "backend-node", "File_Storage", "documents", "projects", file_name)
        
        if not os.path.exists(file_path):
            logger.error(f"Excel file not found: {file_path}")
            return False

        # 3. Fetch Granular Data
        if proj_type == 'ABYIP':
            cursor.execute("""
                SELECT referenceCode, PPA, [Description], expectedResult, performanceIndicator, 
                       period, PS, MOOE, CO, total, personResponsible 
                FROM projectABYIP WHERE projbatchID = ?
            """, batch_id)
            rows = cursor.fetchall()
            mapping = {
                'start_row': 5, # Estimate start row
                'cols': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']
            }
        else: # CBYDP
            cursor.execute("""
                SELECT YDC, objective, performanceIndicator, target1, target2, target3, 
                       PPAs, budget, personResponsible 
                FROM projectCBYDP WHERE projbatchID = ?
            """, batch_id)
            rows = cursor.fetchall()
            mapping = {
                'start_row': 5,
                'cols': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
            }

        # 4. Open Excel and Update
        wb = openpyxl.load_file(file_path)
        ws = wb.active # Assuming single-sheet template
        
        # Clear existing data rows (from start_row down)
        # Note: In a real app, we might want to be more specific or find the table end
        for i in range(mapping['start_row'], mapping['start_row'] + 100):
            for col in mapping['cols']:
                ws[f"{col}{i}"] = None

        # Write new rows
        for idx, row_data in enumerate(rows):
            curr_row = mapping['start_row'] + idx
            for col_idx, value in enumerate(row_data):
                ws[f"{mapping['cols'][col_idx]}{curr_row}"] = value
                # Apply "Calibri 12" as requested
                cell = ws[f"{mapping['cols'][col_idx]}{curr_row}"]
                cell.font = openpyxl.styles.Font(name='Calibri', size=12)

        wb.save(file_path)
        logger.info(f"Successfully synced {len(rows)} rows to {file_name}")
        return True

    except Exception as e:
        logger.error(f"Error syncing Excel for batch {batch_id}: {e}")
        return False
    finally:
        conn.close()

def sync_all_active_projects():
    """
    Finds all non-archived project batches and syncs their files.
    """
    conn = get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT batchID FROM projectBatch WHERE isArchived = 0")
        batches = cursor.fetchall()
        
        results = []
        for (b_id,) in batches:
            success = sync_excel_from_db(b_id)
            results.append({"batchID": b_id, "success": success})
        
        return results
    finally:
        conn.close()
