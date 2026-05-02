import sys
import os
import asyncio

# Add AI, database, util, and projects folders to path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(current_dir, "AI"))
sys.path.append(os.path.join(current_dir, "database"))
sys.path.append(os.path.join(current_dir, "util"))
sys.path.append(os.path.join(current_dir, "projects"))
sys.path.append(os.path.join(current_dir, "automation"))

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

class VerifyRegistrationRequest(BaseModel):
    user_id: int

class InitializeProjectRequest(BaseModel):
    batch_id: int
    barangay_id: int
    proj_type: str
    target_year: str
    file_path: str
    template_name: str
    sk_logo_path: str
    brgy_logo_path: str

class JsonRequest(BaseModel):
    filePath: str

from projects.excel_to_json import excel_to_fortune_json

from AI.accountAIJobs import main as verify_registration_job
from AI.aiJobs import main as run_ai_batch_job
from storage.storage import download_blob_to_memory, upload_blob_from_memory, blob_exists
import uvicorn
import requests
import time
from dotenv import load_dotenv

# Load .env from the backend root (one level up)
dotenv_path = os.path.join(current_dir, "..", ".env")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path=dotenv_path)
    print(f"Loaded .env from: {os.path.abspath(dotenv_path)}")
else:
    # Only warn if critical variables are missing
    if not os.getenv("DB_SERVER"):
        print(f"Warning: .env file not found at {os.path.abspath(dotenv_path)} and environment variables are not set.")

from contextlib import asynccontextmanager

def ping_node_backend(attempts=3):
    # Node.js now runs on NODE_PORT (default 8000)
    port = os.getenv("NODE_PORT", "8000")
    url = f"http://127.0.0.1:{port}/health" # Using 127.0.0.1 for stability
    print(f"Starting connectivity check to Node.js Backend: {url}")
    
    for i in range(1, attempts + 1):
        try:
            response = requests.get(url, timeout=2)
            if response.status_code == 200 or response.status_code == 404: # 404 is fine if health route isn't defined yet, as long as it responds
                print(f"[Attempt {i}] Node.js Backend is REACHABLE.")
                return
        except Exception as e:
            print(f"[Attempt {i}] Node.js Backend is NOT reachable. (Error: {str(e)})")
        
        if i < attempts:
            time.sleep(2)
    print("Node.js Backend connectivity check failed after 3 attempts. Continuing startup...")

from excel_sync import sync_all_active_projects, sync_excel_from_db
import datetime



# --- AI Job Queue Worker ---
ai_job_queue = asyncio.Queue()

async def ai_job_worker():
    while True:
        req_data = await ai_job_queue.get()
        try:
            print("Processing AI Job from queue...")
            # Run the synchronous AI job in a thread pool to avoid blocking the event loop
            await asyncio.to_thread(run_ai_batch_job)
            
            # Fire success callback
            batch_id = req_data.get('batch_id')
            port = os.getenv("NODE_PORT", "8000")
            url = f"http://127.0.0.1:{port}/api/project-batch/webhook/ai-status"
            try:
                requests.post(url, json={"status": "success", "batchID": batch_id}, timeout=5)
                print(f"Successfully sent callback to Node.js for batch {batch_id}")
            except Exception as e:
                print(f"Failed to send success callback to Node.js: {e}")
                
        except Exception as e:
            print(f"AI Job failed: {e}")
            batch_id = req_data.get('batch_id')
            port = os.getenv("NODE_PORT", "8000")
            url = f"http://127.0.0.1:{port}/api/project-batch/webhook/ai-status"
            try:
                requests.post(url, json={"status": "failed", "batchID": batch_id, "error": str(e)}, timeout=5)
            except Exception as cb_err:
                print(f"Failed to send failure callback to Node.js: {cb_err}")
        finally:
            ai_job_queue.task_done()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Node.js connectivity check
    async def delayed_ping():
        await asyncio.sleep(60)
        ping_node_backend()
    
    asyncio.create_task(delayed_ping())
    
    # Start the AI job worker
    worker_task = asyncio.create_task(ai_job_worker())
    
    yield
    
    worker_task.cancel()

app = FastAPI(title="smartSK AI Service", description="FastAPI Microservice for smartSK AI Tasks", lifespan=lifespan)

from export_service import router as export_router
app.include_router(export_router, prefix="/automation/export")

# --- CORS Configuration ---
cors_origin = os.getenv("CORS_ORIGIN", "")
origins = [origin.strip() for origin in cors_origin.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SyncBatchRequest(BaseModel):
    batch_id: int
    file_path: Optional[str] = None
    file_name: Optional[str] = None

@app.post("/sync-project")
def trigger_sync_project(req: SyncBatchRequest):
    temp_local_path = None
    try:
        target_path = req.file_path
        
        # If no local path exists or it's provided but missing (common in Azure sidecars)
        # fallback to downloading from Azure
        if not target_path or not os.path.exists(target_path):
            if not req.file_name:
                 raise HTTPException(status_code=400, detail="Missing both file_path and file_name.")
                 
            print(f"File not found locally at '{target_path}', downloading '{req.file_name}' from Azure...")
            PROJECT_BATCH_CONTAINER = os.getenv("PROJECT_BATCH_CONTAINER", "project-batch")
            file_data = download_blob_to_memory(PROJECT_BATCH_CONTAINER, req.file_name)
            
            if not file_data:
                raise HTTPException(status_code=404, detail=f"File '{req.file_name}' not found in Azure container '{PROJECT_BATCH_CONTAINER}'.")
                
            # Create a temporary local file for openpyxl to process
            import tempfile
            fd, temp_local_path = tempfile.mkstemp(suffix=".xlsx", prefix="sync_")
            os.close(fd)
            with open(temp_local_path, "wb") as f:
                f.write(file_data)
            
            target_path = temp_local_path

        success = sync_excel_from_db(req.batch_id, target_path)
        
        if success:
            # If we used a temp local file, we need to upload the results back to Azure
            if temp_local_path:
                PROJECT_BATCH_CONTAINER = os.getenv("PROJECT_BATCH_CONTAINER", "project-batch")
                with open(temp_local_path, "rb") as f:
                    modified_data = f.read()
                upload_blob_from_memory(PROJECT_BATCH_CONTAINER, req.file_name, modified_data)
                
            return {"status": "ok", "message": f"Excel file for batch {req.batch_id} synchronized."}
        else:
            raise HTTPException(status_code=500, detail="Synchronization failed.")
    except Exception as e:
        print(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_local_path and os.path.exists(temp_local_path):
            try: os.remove(temp_local_path)
            except: pass

@app.get("/health")
def health_check():
    return {"status": "healthy"}

class AIBatchJobRequest(BaseModel):
    batch_id: Optional[int] = None

@app.post("/run-ai-batch-job")
async def trigger_batch_job(req: AIBatchJobRequest):
    try:
        await ai_job_queue.put({'batch_id': req.batch_id})
        return {"status": "ok", "message": "Batch AI Job queued successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/verify-registration")
def trigger_verify_registration(req: VerifyRegistrationRequest, background_tasks: BackgroundTasks):
    try:
        background_tasks.add_task(verify_registration_job, req.user_id)
        return {"status": "ok", "message": f"Verification triggered for user {req.user_id}."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from projects.excel_dupe import duplicate_and_init_excel

@app.post("/initialize-project")
def trigger_initialize_project(req: InitializeProjectRequest):
    try:
        # 1. Configuration for containers
        TEMPLATE_CONTAINER = os.getenv("TEMPLATE_CONTAINER", "template")
        PROJECT_BATCH_CONTAINER = os.getenv("PROJECT_BATCH_CONTAINER", "project-batch")
        
        # 2. Download template and logos from Azure TEMPLATE_CONTAINER
        template_data = download_blob_to_memory(TEMPLATE_CONTAINER, req.template_name)
        sk_logo_data = download_blob_to_memory(TEMPLATE_CONTAINER, req.sk_logo_path)
        brgy_logo_data = download_blob_to_memory(TEMPLATE_CONTAINER, req.brgy_logo_path)
        
        if not template_data:
            raise HTTPException(status_code=404, detail=f"Template {req.template_name} not found in Azure.")

        # 3. Process the duplication and initialization in memory
        modified_excel_data = duplicate_and_init_excel(
            file_data=template_data,
            barangay_id=req.barangay_id,
            proj_type=req.proj_type,
            target_year=req.target_year,
            sk_logo_data=sk_logo_data,
            brgy_logo_data=brgy_logo_data
        )
        
        if modified_excel_data:
            # 4. Upload the result back to Azure
            success = upload_blob_from_memory(PROJECT_BATCH_CONTAINER, req.file_path, modified_excel_data)
            if success:
                return {"status": "ok", "message": f"Project {req.batch_id} initialized successfully on Azure."}
            else:
                raise HTTPException(status_code=500, detail="Failed to upload initialized Excel to Azure.")
        else:
            raise HTTPException(status_code=500, detail="Failed to initialize project template in memory.")
    except Exception as e:
        print(f"Error in initialize-project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/xlsx-to-json")
def trigger_xlsx_to_json(req: JsonRequest):
    try:
        # Check if it's a batch file on Azure
        PROJECT_BATCH_CONTAINER = os.getenv("PROJECT_BATCH_CONTAINER", "project-batch")
        
        file_data = download_blob_to_memory(PROJECT_BATCH_CONTAINER, req.filePath)
        if not file_data:
            # Fallback to local for dev if strictly needed, but prioritize Azure
            if os.path.exists(req.filePath):
                with open(req.filePath, "rb") as f:
                    file_data = f.read()
            else:
                raise HTTPException(status_code=404, detail="Excel file not found on Azure or locally.")
            
        data = excel_to_fortune_json(file_data)
        return {"status": "ok", "data": data}
    except Exception as e:
        print(f"Error in xlsx-to-json conversion: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    py_port = int(os.getenv("PY_PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=py_port)
