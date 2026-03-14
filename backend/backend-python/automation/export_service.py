import os
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO
import openpyxl

# Specialized Utilities
from database.db_utils import get_project_export_filename
from storage.storage import get_blob_client

import tempfile
import subprocess
import platform
import shutil

logger = logging.getLogger(__name__)
router = APIRouter()

# Container configuration for project files
CONTAINER_NAME = os.getenv("PROJECT_BATCH_CONTAINER", "project-batch")

@router.get("/excel/{batch_id}")
async def export_excel(batch_id: int):
    try:
        blob_name, display_name = get_project_export_filename(batch_id)
        if not blob_name:
            raise HTTPException(status_code=404, detail=f"Project batch {batch_id} not found.")
        
        blob_client = get_blob_client(CONTAINER_NAME, blob_name)
        if not blob_client or not blob_client.exists():
             raise HTTPException(status_code=404, detail=f"Synced file '{blob_name}' not found in storage.")
            
        stream = BytesIO()
        download_stream = blob_client.download_blob()
        stream.write(download_stream.readall())
        stream.seek(0)
        
        headers = {
            'Content-Disposition': f'attachment; filename="{display_name}"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }
        
        return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Excel Export Failed for batch {batch_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during Excel export.")

def get_libreoffice_exec():
    """Finds the LibreOffice executable depending on the OS."""
    if platform.system() == 'Windows':
        # Common installation paths on Windows
        paths = [
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"
        ]
        for p in paths:
            if os.path.exists(p):
                return p
        logger.warning("soffice.exe not found in default paths. Ensure LibreOffice is installed.")
        return "soffice" # Hope it's in PATH
    else:
        # Linux / MacOS
        return "libreoffice"

def convert_excel_to_pdf_stream(excel_stream: BytesIO) -> BytesIO:
    """Orchestrates 1:1 high-fidelity conversion of Excel worksheets to PDF via LibreOffice."""
    try:
        soffice_path = get_libreoffice_exec()
        
        # Create a temporary directory for the operation
        with tempfile.TemporaryDirectory() as tmpdir:
            temp_in = os.path.join(tmpdir, "input.xlsx")
            
            # Write the Excel stream to the temp file
            excel_stream.seek(0)
            with open(temp_in, "wb") as f_in:
                f_in.write(excel_stream.read())
            
            # Execute LibreOffice headless conversion
            # --headless: Do not start GUI
            # --nologo: Do not show splash screen
            # --convert-to pdf: Target format
            # --outdir: Where to put the result
            cmd = [
                soffice_path,
                "--headless",
                "--nologo",
                "--convert-to", "pdf",
                "--outdir", tmpdir,
                temp_in
            ]
            
            logger.info(f"Running LibreOffice conversion: {' '.join(cmd)}")
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            
            if result.returncode != 0:
                logger.error(f"LibreOffice conversion failed: {result.stderr}")
                raise Exception(f"LibreOffice error: {result.stderr}")
            
            temp_out = os.path.join(tmpdir, "input.pdf")
            if not os.path.exists(temp_out):
                raise Exception("Conversion succeeded but PDF file was not created.")
            
            # Read the generated PDF back into a BytesIO stream
            pdf_stream = BytesIO()
            with open(temp_out, "rb") as f_out:
                pdf_stream.write(f_out.read())
            
            pdf_stream.seek(0)
            return pdf_stream
            
    except Exception as e:
        logger.error(f"LibreOffice PDF Conversion Failed: {str(e)}")
        raise e

@router.get("/pdf/{batch_id}")
async def export_pdf(batch_id: int):
    try:
        blob_name, display_name = get_project_export_filename(batch_id)
        if not blob_name:
            raise HTTPException(status_code=404, detail="Batch not found.")
            
        blob_client = get_blob_client(CONTAINER_NAME, blob_name)
        if not blob_client or not blob_client.exists():
             raise HTTPException(status_code=404, detail="Sync file not found.")
            
        excel_stream = BytesIO()
        download_stream = blob_client.download_blob()
        excel_stream.write(download_stream.readall())
        excel_stream.seek(0)
        
        pdf_stream = convert_excel_to_pdf_stream(excel_stream)
        
        pdf_filename = display_name.replace(".xlsx", ".pdf")
        headers = {
            'Content-Disposition': f'attachment; filename="{pdf_filename}"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }
        
        return StreamingResponse(pdf_stream, media_type="application/pdf", headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF Export Failed for batch {batch_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during PDF export.")
