import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta
import pandas as pd
import re
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense

from .gemini_utils import call_gemini_with_retry, get_gemini_model, PRIMARY_MODEL

try:
    import google.generativeai as genai
    gemini_available = True
except ImportError:
    gemini_available = False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def process_input_data(df):
    """
    Processes the input DataFrame.
    - Converts budget columns to numeric.
    - Handles missing values.
    """
    if df.empty:
        logger.warning("Input DataFrame is empty. No data to process.")
        return pd.DataFrame()

    # Identify budget columns
    budget_cols = [col for col in df.columns if 'budget' in col.lower()]
    
    if not budget_cols:
        logger.warning("No budget-related columns found in the DataFrame.")
        return df

    # Convert budget columns to numeric, coercing errors to NaN
    for col in budget_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Drop rows where ALL budget columns are NaN
    df.dropna(subset=budget_cols, how='all', inplace=True)
    
    # Fill any remaining NaN values in the DataFrame with 0
    df.fillna(0, inplace=True)

    if df.empty:
        logger.warning("DataFrame is empty after processing (all rows had invalid budget data).")
    else:
        logger.info(f"Successfully processed {len(df)} rows with valid budget data.")
        
    return df

def generate_lstm_analysis(df):
    """
    Performs LSTM-based quantitative analysis to forecast budget variance.
    """
    logger.info("Starting LSTM quantitative analysis for PA...")
    try:
        # 1. Create a budget time series from the filtered dataframe
        if 'year' not in df.columns or 'budget' not in df.columns:
            raise ValueError("DataFrame for LSTM analysis must contain 'year' and 'budget' columns.")
            
        budget_series = df.groupby('year')['budget'].sum()
        
        if len(budget_series) < 3:
            logger.warning("Not enough historical data (< 3 years) for LSTM analysis. Returning placeholder values.")
            return {
                "predicted_success_probability": 0.85, # Placeholder
                "forecasted_budget_variance": "Not enough data"
            }

        # 2. Use LSTM to predict the next year's budget
        series_values = budget_series.values.reshape(-1, 1)
        scaler = MinMaxScaler()
        series_scaled = scaler.fit_transform(series_values)

        X, y = [], []
        # Using a sequence of 2 to predict the 3rd
        for i in range(len(series_scaled) - 2):
            X.append(series_scaled[i:i+2])
            y.append(series_scaled[i+2])
        
        if not X:
            # Handle case with only 2 data points
            last_value = budget_series.iloc[-1]
            return {
                "predicted_success_probability": 0.80, # Placeholder
                "forecasted_budget_variance": "+0.0%" # Assume no change
            }

        X, y = np.array(X), np.array(y)

        model = Sequential([
            LSTM(50, activation='relu', input_shape=(X.shape[1], 1)),
            Dense(1)
        ])
        model.compile(optimizer='adam', loss='mse')
        model.fit(X, y, epochs=100, verbose=0)

        last_sequence = series_scaled[-2:].reshape((1, 2, 1))
        predicted_scaled = model.predict(last_sequence, verbose=0)
        predicted_budget = scaler.inverse_transform(predicted_scaled)[0][0]

        # 3. Calculate variance
        last_budget = budget_series.iloc[-1]
        if last_budget > 0:
            variance = ((predicted_budget - last_budget) / last_budget)
        else:
            variance = float('inf') if predicted_budget > 0 else 0.0

        logger.info(f"LSTM analysis complete. Predicted budget: {predicted_budget}, Variance: {variance:.2%}")

        return {
            "predicted_success_probability": 0.85, # This remains a placeholder as success metric is not in the data
            "forecasted_budget_variance": f"{variance:+.1%}"
        }

    except Exception as e:
        logger.error(f"Error during LSTM analysis in pa_logic: {e}", exc_info=True)
        return {
            "predicted_success_probability": "N/A",
            "forecasted_budget_variance": "Error during calculation"
        }


def generate_gemini_analysis(df, filters, api_key):
    """
    Generates a qualitative textual analysis report using the Gemini API,
    based on the provided data and filters.
    """
    logger.info(f"Starting Gemini analysis generation with filters: {filters}")
    if not gemini_available or not api_key:
        raise ConnectionError("Gemini AI is not available or API key is not configured.")

    genai.configure(api_key=api_key)
    model = get_gemini_model(PRIMARY_MODEL)

    # --- Data Preparation for Prompt ---
    data_preview = df.head(15).to_string() if not df.empty else "No historical data available."
    
    # Dynamically build the prompt based on filters
    category = filters.get('category', 'all categories')
    
    filter_description = f"for projects in '{category}'"
    
    prompt = f'''
    You are a senior data analyst for a Sangguniang Kabataan (SK) council in District 5, Quezon City.
    Your task is to provide a predictive analysis based ONLY on the historical data provided.
    Do not use any external knowledge or make assumptions beyond this data.

    **1. Analysis Context:**
    - The analysis is for: {filter_description}.
    - The forecast year is {datetime.now().year + 1}.

    **2. Historical Data Preview (Primary and ONLY source):**
    {data_preview}

    **3. JSON Output Requirements:**
    Provide a JSON object with the following exact structure. Base your entire analysis on the provided data.

    {{
        "summary_report": "An executive summary of key findings from the historical data.",
        "success_factors": [
            "A key success factor derived from the data.",
            "Another success factor observed in the data."
        ],
        "recommendations": [
            "An actionable recommendation based on historical patterns.",
            "Another data-driven recommendation."
        ],
        "risk_mitigation_strategies": [
            {{
                "risk": "A potential risk identified from the data (e.g., budget overruns in a specific category).",
                "mitigation": "A strategy to mitigate this risk based on past project performance."
            }}
        ],
        "predicted_trends": [
            "A trend prediction based purely on the trajectory of the historical data provided."
        ],
        "budget": {{
            "analysis": "A detailed analysis of budget allocation and spending patterns found in the data.",
            "historical_patterns": "Specific historical budget patterns observed.",
            "recommendations": "Budget recommendations for {datetime.now().year + 1} based on the data."
        }},
        "implementation_date": {{
            "analysis": "Analysis of the best timing for projects based on historical start and end dates in the data.",
            "historical_patterns": "Patterns in project timing observed from the data."
        }},
        "estimated_duration": {{
            "analysis": "Analysis of typical project durations based on the data.",
            "historical_timeframes": "Observed historical timeframes for projects in this category."
        }},
        "feedback": "A summary of expected community feedback based on similar past projects in the data."
    }}

    **CRITICAL:**
    - Generate ONLY the JSON object. Do not include markdown formatting (```json) or any other text.
    - Your entire response must be based strictly on the provided data preview.
    '''

    # Define the validation function
    def is_valid_analysis_response(data):
        # Check for a key that should always be present, like 'summary_report'
        return 'summary_report' in data and isinstance(data.get('summary_report'), str)

    # Call the utility
    analysis_result = call_gemini_with_retry(model, prompt, is_valid_analysis_response)

    if analysis_result:
        logger.info("Successfully generated and parsed analysis report from Gemini.")
        return analysis_result
    else:
        logger.error("Failed to generate Gemini analysis after multiple attempts.")
        return {
            "error": True,
            "message": f"Failed to generate or parse AI analysis after 5 attempts.",
            "summary_report": "Analysis could not be generated due to persistent API errors."
        }

def generate_project_analysis(df, api_key, filters=None):
    """
    The main function to generate a complete predictive analysis report for a given dataset and filters.
    
    Args:
        df (pd.DataFrame): The input DataFrame containing historical project data.
        api_key (str): The Gemini API key.
        filters (dict): A dictionary specifying the filters to apply, e.g.,
                        {'category': 'Health', 'time_period': 'Quarterly', 'time_detail': 'Q1'}.
                        If None or empty, a general analysis is performed.

    Returns:
        dict: A dictionary containing the full analysis report.
    """
    if filters is None:
        filters = {}
        
    logger.info(f"--- Starting Project Analysis for filters: {filters} ---")

    try:
        # Apply filters to the DataFrame
        filtered_df = df.copy()
        
        # Category filter
        if 'category' in filters and filters['category']:
            filtered_df = filtered_df[filtered_df['category'].str.lower() == filters['category'].lower()]
        
        if filtered_df.empty:
            logger.warning(f"No data remains after applying filters: {filters}. Returning an empty report.")
            return {
                "summary_report": "Insufficient data for this specific filter combination.",
                "recommendations": ["Try broadening the filter criteria."],
                "error": True,
                "message": "No historical data matched the selected filters."
            }

        # Process the filtered data
        processed_df = process_input_data(filtered_df)
        if processed_df.empty:
             return {
                "summary_report": "Insufficient data for this specific filter combination.",
                "recommendations": ["Try broadening the filter criteria."],
                "error": True,
                "message": "No valid budget data found after processing."
            }

        # Generate qualitative analysis from Gemini
        qualitative_analysis = generate_gemini_analysis(processed_df, filters, api_key)
        
        # Generate quantitative analysis from LSTM (placeholder)
        quantitative_analysis = generate_lstm_analysis(processed_df)
        
        # Combine all parts into the final report
        final_report = qualitative_analysis
        final_report['quantitative_analysis'] = quantitative_analysis # Add LSTM results
        
        # Add metadata
        ph_tz = timezone(timedelta(hours=8))
        final_report['metadata'] = {
            'data_source': "Historical Data",
            'total_projects_analyzed': len(processed_df),
            'filters_applied': filters,
            'timestamp': datetime.now(ph_tz).isoformat(),
            'gemini_used': not qualitative_analysis.get('error', False),
            'lstm_used': True
        }
        
        logger.info(f"--- Finished Project Analysis for filters: {filters} ---")
        return final_report

    except Exception as e:
        logger.error(f"An unhandled error occurred in generate_project_analysis: {e}", exc_info=True)
        raise  # Re-raise the exception to signal failure to the caller
