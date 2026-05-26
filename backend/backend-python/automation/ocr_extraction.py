import os
import re
import io
import pdfplumber
import pytesseract
from PIL import Image
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from word2number import w2n

router = APIRouter()

def clean_word_amount(word_amount: str) -> str:
    """Clean the word amount string for word2number parsing."""
    # Remove any extra spaces, dashes, or non-alphabet chars except spaces
    cleaned = re.sub(r'[^A-Za-z\s\-]', '', word_amount).strip()
    return cleaned

@router.post("/extract-budget")
async def extract_budget(file: UploadFile = File(...)):
    try:
        # 1. Read file directly from upload
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file provided.")
            
        text = ""
        
        # 2. Extract text based on file type
        ext = file.filename.lower().split('.')[-1]
        
        try:
            if ext == 'pdf':
                with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            # Search for keywords to find the right page
                            text_lower = page_text.lower()
                            has_10 = "10%" in text_lower
                            has_represents = "represents" in text_lower or "representing" in text_lower
                            has_fund = "general fund" in text_lower or "general funds" in text_lower
                            if has_10 and has_represents and has_fund:
                                text = page_text + "\n"
                                break
            elif ext in ['png', 'jpg', 'jpeg']:
                img = Image.open(io.BytesIO(file_bytes))
                text = pytesseract.image_to_string(img)
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
        except Exception as e:
            print(f"Extraction error: {e}")
            raise HTTPException(status_code=500, detail="Failed to read file. Please ensure it is a clear PDF or Image.")

        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract any text or could not find the relevant keywords in the document. Please upload a clearer copy.")

        # Clean text: replace newlines with spaces to help regex match across lines
        clean_text = re.sub(r'\s+', ' ', text)
        
        # We also check the keyword for images just in case it was missed
        if ext in ['png', 'jpg', 'jpeg']:
            text_lower = clean_text.lower()
            has_10 = "10%" in text_lower
            has_represents = "represents" in text_lower or "representing" in text_lower
            has_fund = "general fund" in text_lower or "general funds" in text_lower
            if not (has_10 and has_represents and has_fund):
                 raise HTTPException(status_code=400, detail="Could not find the relevant keywords in the image. Please upload the correct page.")

        # 3. Use Regex to find the pattern
        # "amount of [WORDS] (P[NUMBERS]) representing the ten (10%)"
        # We allow P, PHP, or ₱ symbol optionally.
        pattern = r"amount of\s+([A-Za-z\s\-,]+?)\s*\(\s*(?:P|PHP|₱)?\s*([\d,]+\.?\d*)\s*\)\s*representing"
        
        match = re.search(pattern, clean_text, re.IGNORECASE)
        if not match:
            # Fallback pattern if format varies slightly
            pattern_fallback = r"amount of\s+([A-Za-z\s\-,]+?)\s*\(\s*(?:P|PHP|₱)?\s*([\d,]+\.?\d*)\s*\)"
            match = re.search(pattern_fallback, clean_text, re.IGNORECASE)
            
        if not match:
            raise HTTPException(status_code=400, detail="Could not find the standard income certification text pattern in the document. Please upload a clearer copy.")

        words_part = match.group(1).strip()
        numbers_part = match.group(2).strip()

        # 4. Parse the numbers
        try:
            numeric_value_from_str = float(numbers_part.replace(',', ''))
        except ValueError:
            raise HTTPException(status_code=400, detail="Extracted number format is invalid. Please upload a clearer copy.")

        return {
            "success": True,
            "extracted_budget": numeric_value_from_str,
            "text_found": {
                "words": words_part,
                "numbers": numbers_part
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"OCR Budget Extraction Error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
