import os
from base64 import b64decode
from Crypto.Cipher import AES
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# --- Configuration ---
IV_LENGTH = 12
AUTH_TAG_LENGTH = 16
KEY = os.getenv("AES_256_KEY")

# --- Key Validation ---
if not KEY:
    raise Exception('AES_256_KEY environment variable is not set.')
if len(bytes.fromhex(KEY)) != 32:
    raise Exception('AES_256_KEY must be a 64-character hex string (32 bytes).')

# Convert hex key to bytes
key_bytes = bytes.fromhex(KEY)

def decrypt(encrypted_text: str) -> str:
    """
    Decrypts an AES-256-GCM encrypted, Base64 encoded string.
    This function is a Python port of the decryption logic in crypto.js.
    """
    if encrypted_text is None:
        return None
    
    try:
        encrypted_data = b64decode(encrypted_text)
        
        # Extract IV, auth tag, and ciphertext
        iv = encrypted_data[:IV_LENGTH]
        auth_tag = encrypted_data[-AUTH_TAG_LENGTH:]
        ciphertext = encrypted_data[IV_LENGTH:-AUTH_TAG_LENGTH]
        
        # Create AES cipher
        cipher = AES.new(key_bytes, AES.MODE_GCM, nonce=iv)
        
        # Decrypt and verify
        decrypted_bytes = cipher.decrypt_and_verify(ciphertext, auth_tag)
        
        return decrypted_bytes.decode('utf-8')
        
    except (ValueError, KeyError) as e:
        print(f"Decryption failed: {e}")
        # This can happen if the auth tag is incorrect (tampered data) or other issues.
        return None
