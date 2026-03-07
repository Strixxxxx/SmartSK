import os
import shutil
from openpyxl import load_workbook
from openpyxl.drawing.image import Image as OpenpyxlImage
from openpyxl.styles import Alignment
from PIL import Image as PILImage
import logging

logger = logging.getLogger(__name__)

def resize_image_proportional(img_path, target_width_px):
    """
    Resizes an image proportionally given a target width in pixels.
    Returns an openpyxl Image object.
    """
    with PILImage.open(img_path) as img:
        # Calculate aspect ratio
        width, height = img.size
        aspect_ratio = height / width
        target_height_px = int(target_width_px * aspect_ratio)
        
        # We don't actually need to save a temporary file, openpyxl.drawing.image.Image 
        # can take a PIL Image object directly in some versions, but to be safe and 
        # consistent with openpyxl API, we'll set the width/height on the wrapper.
        ox_img = OpenpyxlImage(img_path)
        ox_img.width = target_width_px
        ox_img.height = target_height_px
        return ox_img

def duplicate_and_init_excel(batch_id: int, barangay_id: int, proj_type: str, target_year: str) -> bool:
    """
    Duplicates the template, updates target years across all sheets,
    and programmatically re-inserts SK and Barangay logos with proportional resizing.
    """
    try:
        abbr = "SB" if barangay_id == 1 else "NN"
        base_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        
        template_dir = os.path.join(base_path, "backend-node", "File_Storage", "templates")
        logo_dir = os.path.join(template_dir, "logos")
        output_dir = os.path.join(base_path, "backend-node", "File_Storage", "project-batch")
        
        os.makedirs(output_dir, exist_ok=True)
        
        # 1. Define Paths and Widths
        template_name = f"{proj_type}_TEMPLATE_{abbr}.xlsx"
        template_path = os.path.join(template_dir, template_name)
        
        sk_logo_path = os.path.join(logo_dir, "sk_logo.png")
        brgy_logo_filename = "SB.png" if barangay_id == 1 else "NN.png"
        brgy_logo_path = os.path.join(logo_dir, brgy_logo_filename)
        
        # Target width based on user feedback 
        # CBYDP: 0.9" ~ 86px
        # ABYIP: 1.15" ~ 100px (Already good)
        target_width = 86 if proj_type == 'CBYDP' else 100
        
        if not os.path.exists(template_path):
            logger.error(f"Template not found: {template_path}")
            return False
            
        new_file_name = f"{proj_type}_{abbr}_{target_year}.xlsx"
        new_file_path = os.path.join(output_dir, new_file_name)
        
        # 2. Duplicate file
        shutil.copy2(template_path, new_file_path)
        
        # 3. Load with openpyxl
        wb = load_workbook(new_file_path)
        
        # 4. Iterate through all sheets
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            
            # --- CELL UPDATES ---
            if proj_type == 'ABYIP':
                ws['B9'] = f"FY {target_year}"
            elif proj_type == 'CBYDP':
                ws['B10'] = f"COMPREHENSIVE BARANGAY YOUTH DEVELOPMENT PLAN (CBYDP) CY {target_year}"
                
                years = target_year.split('-')
                start_year = int(years[0]) if len(years) > 0 else 0
                if start_year > 0:
                    for i, col in enumerate(['E', 'F', 'G']):
                        cell = ws[f'{col}13']
                        cell.value = start_year + i
                        cell.alignment = Alignment(horizontal='center')

            # --- LOGO RE-INSERTION (RESIZED) ---
            # 1 pixel = 9525 EMUs (English Metric Units)
            pixel_to_emu = 9525
            from openpyxl.drawing.spreadsheet_drawing import OneCellAnchor, AnchorMarker
            from openpyxl.drawing.xdr import XDRPositiveSize2D
            
            # Barangay Logo on D1
            if os.path.exists(brgy_logo_path):
                img_brgy = resize_image_proportional(brgy_logo_path, target_width)
                # D is col index 3
                col_idx = 3 
                col_offset = 13 * pixel_to_emu if proj_type == 'CBYDP' else 0
                
                marker = AnchorMarker(col=col_idx, colOff=col_offset, row=0, rowOff=0)
                size = XDRPositiveSize2D(img_brgy.width * pixel_to_emu, img_brgy.height * pixel_to_emu)
                img_brgy.anchor = OneCellAnchor(_from=marker, ext=size)
                ws.add_image(img_brgy)
            
            # SK Logo on H1
            if os.path.exists(sk_logo_path):
                img_sk = resize_image_proportional(sk_logo_path, target_width)
                # H is col index 7
                col_idx = 7
                col_offset = 13 * pixel_to_emu if proj_type == 'CBYDP' else 0
                
                marker = AnchorMarker(col=col_idx, colOff=col_offset, row=0, rowOff=0)
                size = XDRPositiveSize2D(img_sk.width * pixel_to_emu, img_sk.height * pixel_to_emu)
                img_sk.anchor = OneCellAnchor(_from=marker, ext=size)
                ws.add_image(img_sk)

        # 5. Save Final File
        wb.save(new_file_path)
        logger.info(f"Successfully initialized Excel with resized logos: {new_file_name}")
        return True
        
    except Exception as e:
        logger.error(f"Error in Linux-safe Excel duplication for batch {batch_id}: {e}")
        return False
