import os
import logging
from azure.storage.blob import BlobServiceClient
from io import BytesIO
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

JSON_CONTAINER = os.getenv("JSON_CONTAINER")

_blob_service_client = None

def get_blob_service_client():
    """Returns a singleton BlobServiceClient instance."""
    global _blob_service_client
    if _blob_service_client is None:
        # Use connection string from .env
        conn_str = os.getenv("STORAGE_CONNECTION_STRING_1")
        if not conn_str:
            # Fallback to individual components if connection string is missing
            account_name = os.getenv("STORAGE_NAME")
            account_key = os.getenv("STORAGE_KEY_1")
            if account_name and account_key:
                conn_str = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={account_key};EndpointSuffix=core.windows.net"
        
        if not conn_str:
            logger.error("Azure Storage connection string not found in environment variables.")
            return None
            
        # Remove potential surrounding quotes if they exist
        conn_str = conn_str.strip("'").strip('"')
        _blob_service_client = BlobServiceClient.from_connection_string(conn_str)
    return _blob_service_client

def download_blob_to_memory(container_name, blob_name) -> bytes:
    """Downloads a blob from Azure Storage into memory."""
    client = get_blob_service_client()
    if not client:
        return None
    
    try:
        blob_client = client.get_blob_client(container=container_name, blob=blob_name)
        stream = blob_client.download_blob()
        return stream.readall()
    except Exception as e:
        logger.error(f"Failed to download blob '{blob_name}' from container '{container_name}': {e}")
        return None

def upload_blob_from_memory(container_name, blob_name, data: bytes, overwrite=True):
    """Uploads bytes data to an Azure Blob Storage container."""
    client = get_blob_service_client()
    if not client:
        return False
    
    try:
        blob_client = client.get_blob_client(container=container_name, blob=blob_name)
        blob_client.upload_blob(data, overwrite=overwrite)
        logger.info(f"Successfully uploaded blob '{blob_name}' to container '{container_name}'.")
        return True
    except Exception as e:
        logger.error(f"Failed to upload blob '{blob_name}' to container '{container_name}': {e}")
        return False

def list_blobs(container_name, prefix=None):
    """Lists blobs in a container with an optional prefix."""
    client = get_blob_service_client()
    if not client:
        return []
    
    try:
        container_client = client.get_container_client(container_name)
        return [blob.name for blob in container_client.list_blobs(name_starts_with=prefix)]
    except Exception as e:
        logger.error(f"Failed to list blobs in container '{container_name}': {e}")
        return []

def blob_exists(container_name, blob_name):
    """Checks if a blob exists in a container."""
    client = get_blob_service_client()
    if not client:
        return False
    
    try:
        blob_client = client.get_blob_client(container=container_name, blob=blob_name)
        return blob_client.exists()
    except Exception as e:
        logger.error(f"Error checking existence of blob '{blob_name}': {e}")
        return False

def get_blob_client(container_name, blob_name):
    """Returns a BlobClient for a specific blob."""
    client = get_blob_service_client()
    if not client:
        return None
    return client.get_blob_client(container=container_name, blob=blob_name)
