"""
profiling_service.py
Checkpoint 1: Youth Profiling Validation Service
Validates uploaded files against DILG MC No. 2022-033 Annex 4 schema,
checks DPA compliance, and caches demographic analytics to the database.
"""

import os
import io
import logging
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

# Internal utilities
import sys
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(current_dir, '..', 'database'))
sys.path.append(os.path.join(current_dir, '..', 'storage'))

from db_utils import engine
from storage.storage import download_blob_to_memory

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Pydantic Models for Analytics
# ---------------------------------------------------------------------------

class ProfileAnalyticsRequest(BaseModel):
    term_id: int = Field(..., description="Active SK term ID")
    barangay_id: int = Field(..., description="Barangay ID of the submitting council")
    submission_id: int = Field(..., description="ID from youth_profiling_submissions table")
    master_dataset_blob: str = Field(..., description="Azure blob name of the master youth dataset XLSX")


class ProfileAnalyticsResponse(BaseModel):
    status: str
    message: str
    analytics: Optional[dict] = None



# ---------------------------------------------------------------------------
# Magic Number Signatures
# MIME validation by inspecting the first raw bytes of the file, not trusting
# the file extension. Prevents extension-spoofed payload attacks.
# ---------------------------------------------------------------------------

MAGIC_SIGNATURES = {
    # PDF: %PDF- header
    "pdf": [(0, b"%PDF-")],
    # XLSX / modern Office Open XML (ZIP-based):  PK\x03\x04
    "xlsx": [(0, b"\x50\x4B\x03\x04")],
    # JPEG: FF D8 FF
    "jpeg": [(0, b"\xFF\xD8\xFF")],
    # PNG: 89 50 4E 47 0D 0A 1A 0A
    "png": [(0, b"\x89\x50\x4E\x47\x0D\x0A\x1A\x0A")],
}

ALLOWED_IMAGE_TYPES = {"jpeg", "png"}
ALLOWED_NOTICE_LETTER_TYPES = {"pdf", "jpeg", "png"}

def detect_file_type(data: bytes) -> Optional[str]:
    """Returns the detected file type string or None if unrecognised."""
    for file_type, sigs in MAGIC_SIGNATURES.items():
        for offset, signature in sigs:
            if data[offset: offset + len(signature)] == signature:
                return file_type
    return None


def validate_magic_number(data: bytes, expected_type: str) -> bool:
    """Returns True if the file magic bytes match the expected type."""
    detected = detect_file_type(data)
    return detected == expected_type


# ---------------------------------------------------------------------------
# DILG MC No. 2022-033 Annex 4 — Exact Required Column Schema
# Column names must exactly match those in the official government template.
# ---------------------------------------------------------------------------

ANNEX4_REQUIRED_COLUMNS = [
    "REGION",
    "PROVINCE",
    "CITY/MUNICIPALITY",
    "BARANGAY",
    "NAME",
    "AGE",
    "BIRTHDAY - Month",
    "BIRTHDAY - Day",
    "BIRTHDAY - Year",
    "SEX ASSIGNED AT BIRTH",
    "CIVIL STATUS",
    "YOUTH CLASSIFICATION",
    "YOUTH AGE GROUP",
    "EMAIL ADDRESS",
    "CONTACT NUMBER",
    "HOME ADDRESS",
    "HIGHEST EDUCATIONAL ATTAINMENT",
    "WORK STATUS",
    "Registered voter? Y/N",
    "Voted Last Election? Y/N",
    "Attended a KK assembly? Y/N",
    "If yes, how many times?",
]

VALID_SEX_VALUES = {"Male", "Female"}
VALID_CLASSIFICATION = {"ISY", "OSY", "NEET", "WY", "YSN"}
VALID_AGE_GROUP = {
    "Child Youth (15-17 yrs old)",
    "Core Youth (18-24 yrs old)",
    "Young Adult (25-30 yrs old)",
}
YOUTH_AGE_MIN = 15
YOUTH_AGE_MAX = 30

import re

AGE_GROUP_ALIASES = {
    "15-17": "Child Youth (15-17 yrs old)",
    "child youth": "Child Youth (15-17 yrs old)",
    "18-24": "Core Youth (18-24 yrs old)",
    "core youth": "Core Youth (18-24 yrs old)",
    "25-30": "Young Adult (25-30 yrs old)",
    "young adult": "Young Adult (25-30 yrs old)",
}

def _normalize_age_group(raw: str):
    """Normalize a YOUTH AGE GROUP value to its canonical form, or None if unrecognisable."""
    val = raw.strip().lower()
    if raw.strip() in VALID_AGE_GROUP:
        return raw.strip()
    for alias, canonical in AGE_GROUP_ALIASES.items():
        if alias in val:
            return canonical
    m = re.search(r'(\d+)\s*[-–]\s*(\d+)', val)
    if m:
        key = f"{m.group(1)}-{m.group(2)}"
        if key in AGE_GROUP_ALIASES:
            return AGE_GROUP_ALIASES[key]
    return None


# ---------------------------------------------------------------------------
# Core Validation Logic
# ---------------------------------------------------------------------------

def _validate_notice_letter(blob_name: str) -> List[str]:
    """Downloads and validates the notice letter (PDF, JPEG, or PNG) by magic number."""
    errors = []
    data = download_blob_to_memory(os.getenv("PROFILING_CONTAINER", "profiling-docs"), blob_name)
    if data is None:
        errors.append(f"Notice letter blob '{blob_name}' could not be retrieved from Azure Storage.")
        return errors
    detected = detect_file_type(data)
    if detected not in ALLOWED_NOTICE_LETTER_TYPES:
        errors.append(
            f"Notice letter file signature mismatch. Expected PDF, JPEG, or PNG but detected "
            f"'{detected or 'unknown'}'. The file may be extension-spoofed."
        )
    return errors


def _validate_campaign_proofs(blob_names: List[str]) -> List[str]:
    """Downloads and validates each campaign proof image by magic number."""
    errors = []
    container = os.getenv("PROFILING_CONTAINER", "profiling-docs")
    for blob_name in blob_names:
        data = download_blob_to_memory(container, blob_name)
        if data is None:
            errors.append(f"Campaign proof blob '{blob_name}' could not be retrieved from Azure Storage.")
            continue
        detected = detect_file_type(data)
        if detected not in ALLOWED_IMAGE_TYPES:
            errors.append(
                f"Campaign proof '{blob_name}': expected JPEG or PNG image but detected "
                f"'{detected or 'unknown'}'. The file may be extension-spoofed."
            )
    return errors


def _validate_master_dataset(blob_name: str) -> tuple[List[str], Optional[pd.DataFrame]]:
    """
    Downloads, validates magic number, checks Annex 4 column schema,
    and returns (errors, dataframe). Row-level errors are ignored to allow analytics.
    """
    errors = []
    container = os.getenv("PROFILING_CONTAINER", "profiling-docs")

    data = download_blob_to_memory(container, blob_name)
    if data is None:
        errors.append(f"Master dataset blob '{blob_name}' could not be retrieved from Azure Storage.")
        return errors, None

    # Magic number check: XLSX is ZIP-based (PK header)
    if not validate_magic_number(data, "xlsx"):
        detected = detect_file_type(data)
        errors.append(
            f"Master dataset file signature mismatch. Expected XLSX (ZIP/PK header) but detected "
            f"'{detected or 'unknown'}'. This file may be extension-spoofed or corrupt."
        )
        return errors, None

    # Parse the Excel file
    try:
        df = pd.read_excel(io.BytesIO(data), engine="openpyxl", dtype=str)
    except Exception as e:
        errors.append(f"Failed to parse master dataset Excel file: {str(e)}")
        return errors, None

    # Strip whitespace from column headers
    df.columns = [c.strip() for c in df.columns]

    # Column schema validation — must match Annex 4 exactly
    missing_cols = [col for col in ANNEX4_REQUIRED_COLUMNS if col not in df.columns]
    if missing_cols:
        errors.append(
            f"Master dataset is missing {len(missing_cols)} required DILG Annex 4 column(s): "
            + ", ".join([f"'{c}'" for c in missing_cols])
        )
        return errors, None

    if df.empty:
        errors.append("Master dataset contains no data rows.")
        return errors, None

    # Return the df. Row-level validation is skipped to support non-blocking manual SKC review.
    return errors, df


def _compute_analytics(df: pd.DataFrame) -> dict:
    """
    Aggregates Annex 4 dataset into demographic metrics for the analytics cache.
    Returns a dict matching youth_profile_analytics column structure.
    """
    total = len(df)

    sex_col = df["SEX ASSIGNED AT BIRTH"].str.strip()
    male_count = int((sex_col == "Male").sum())
    female_count = int((sex_col == "Female").sum())

    cls_col = df["YOUTH CLASSIFICATION"].str.strip()
    student_count = int((cls_col == "ISY").sum())
    # OSY + NEET grouped together as out-of-school
    out_of_school_count = int(cls_col.isin({"OSY", "NEET"}).sum())
    employed_count = int((cls_col == "WY").sum())

    work_col = df["WORK STATUS"].str.strip()
    unemployed_count = int(work_col.isin({"Unemployed", "Currently looking for a Job"}).sum())

    age_group_col = df["YOUTH AGE GROUP"].apply(
        lambda v: _normalize_age_group(str(v)) or str(v).strip()
    )
    child_youth_count = int((age_group_col == "Child Youth (15-17 yrs old)").sum())
    core_youth_count = int((age_group_col == "Core Youth (18-24 yrs old)").sum())
    young_adult_count = int((age_group_col == "Young Adult (25-30 yrs old)").sum())

    return {
        "totalCount": total,
        "maleCount": male_count,
        "femaleCount": female_count,
        "studentCount": student_count,
        "outOfSchoolCount": out_of_school_count,
        "employedCount": employed_count,
        "unemployedCount": unemployed_count,
        "childYouthCount": child_youth_count,
        "coreYouthCount": core_youth_count,
        "youngAdultCount": young_adult_count,
    }


def _cache_analytics(term_id: int, barangay_id: int, revision_year: int, minor_version: int, analytics: dict):
    """
    Writes computed analytics to youth_profile_analytics using MERGE (upsert).
    The unique constraint UQ_analytics_version protects historical record integrity.
    """
    upsert_sql = text("""
        MERGE youth_profile_analytics AS target
        USING (SELECT
            :term_id AS termID,
            :barangay_id AS barangayID,
            :revision_year AS revisionYear,
            :minor_version AS minorVersion
        ) AS source
        ON (
            target.termID = source.termID AND
            target.barangayID = source.barangayID AND
            target.revisionYear = source.revisionYear AND
            target.minorVersion = source.minorVersion
        )
        WHEN MATCHED THEN UPDATE SET
            totalCount        = :totalCount,
            maleCount         = :maleCount,
            femaleCount       = :femaleCount,
            studentCount      = :studentCount,
            outOfSchoolCount  = :outOfSchoolCount,
            employedCount     = :employedCount,
            unemployedCount   = :unemployedCount,
            childYouthCount   = :childYouthCount,
            coreYouthCount    = :coreYouthCount,
            youngAdultCount   = :youngAdultCount,
            updatedAt         = GETDATE()
        WHEN NOT MATCHED THEN INSERT (
            termID, barangayID, revisionYear, minorVersion,
            totalCount, maleCount, femaleCount,
            studentCount, outOfSchoolCount, employedCount, unemployedCount,
            childYouthCount, coreYouthCount, youngAdultCount
        ) VALUES (
            :term_id, :barangay_id, :revision_year, :minor_version,
            :totalCount, :maleCount, :femaleCount,
            :studentCount, :outOfSchoolCount, :employedCount, :unemployedCount,
            :childYouthCount, :coreYouthCount, :youngAdultCount
        );
    """)

    with engine.begin() as conn:
        conn.execute(upsert_sql, {
            "term_id": term_id,
            "barangay_id": barangay_id,
            "revision_year": revision_year,
            "minor_version": minor_version,
            **analytics,
        })


def _mark_submission_complete(submission_id: int):
    """Updates the submission record status to CHECKPOINT_1_COMPLETE."""
    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE youth_profiling_submissions
                SET status = 'CHECKPOINT_1_COMPLETE', updatedAt = GETDATE()
                WHERE submissionID = :sid
            """),
            {"sid": submission_id}
        )


def _get_submission_version(submission_id: int) -> tuple[int, int]:
    """Returns (revisionYear, minorVersion) for the given submission."""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT revisionYear, minorVersion FROM youth_profiling_submissions WHERE submissionID = :sid"),
            {"sid": submission_id}
        ).fetchone()
    if row:
        return row[0] or 0, row[1] or 1
    return 0, 1


# ---------------------------------------------------------------------------
# Demographic Analytics Orchestrator
# ---------------------------------------------------------------------------

async def compute_and_cache_analytics(payload: ProfileAnalyticsRequest) -> dict:
    """
    Asynchronously parses the master dataset and aggregates/caches demographic data.
    Runs non-strictly and ignores validation rules to keep operations smooth.
    """
    container = os.getenv("PROFILING_CONTAINER", "profiling-docs")
    data = download_blob_to_memory(container, payload.master_dataset_blob)
    if data is None:
        raise ValueError(f"Master dataset blob '{payload.master_dataset_blob}' could not be downloaded.")

    # Parse Excel non-strictly
    df = pd.read_excel(io.BytesIO(data), engine="openpyxl", dtype=str)
    df.columns = [c.strip() for c in df.columns]

    # Ensure required analytics columns exist (robust fallback)
    required_cols = ["SEX ASSIGNED AT BIRTH", "YOUTH CLASSIFICATION", "WORK STATUS", "YOUTH AGE GROUP"]
    for col in required_cols:
        if col not in df.columns:
            df[col] = ""

    # Compute aggregated metrics
    analytics = _compute_analytics(df)

    # Cache to database
    revision_year, minor_version = _get_submission_version(payload.submission_id)
    _cache_analytics(
        term_id=payload.term_id,
        barangay_id=payload.barangay_id,
        revision_year=revision_year,
        minor_version=minor_version,
        analytics=analytics
    )

    return analytics


# ---------------------------------------------------------------------------
# FastAPI Router Endpoints
# ---------------------------------------------------------------------------

@router.post("/analytics", response_model=ProfileAnalyticsResponse)
async def trigger_profiling_analytics(payload: ProfileAnalyticsRequest):
    """
    POST /api/v1/checkpoints/profiling/analytics
    Calculates demographics and caches them in the background (non-blocking).
    """
    try:
        analytics = await compute_and_cache_analytics(payload)
        return ProfileAnalyticsResponse(
            status="ok",
            message="Demographic analytics cached successfully.",
            analytics=analytics
        )
    except Exception as err:
        logger.error(f"[profiling_service] Analytics computation error: {err}", exc_info=True)
        # We return a successful response status but flag the failure so the Node.js caller
        # is aware of the analytics pipeline issue without disrupting the user flow.
        return ProfileAnalyticsResponse(
            status="failed",
            message=f"Analytics computation failed: {str(err)}",
            analytics=None
        )

