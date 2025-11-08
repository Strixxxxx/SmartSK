import os
import json
import logging
import re
from datetime import datetime, timezone, timedelta
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense

from .gemini_utils import call_gemini_with_retry

try:
    import google.generativeai as genai
    gemini_available = True
except ImportError:
    gemini_available = False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def _run_lstm_forecast(series: pd.Series) -> float:
    """
    Trains a simple LSTM model on a given time series and predicts the next value.
    Args:
        series (pd.Series): A pandas Series with time-ordered data (e.g., budget per year).
    Returns:
        float: The predicted next value in the series.
    """
    if len(series) < 3:
        # Not enough data to train, return the last value or 0
        return series.iloc[-1] if not series.empty else 0

    # Normalize the data
    scaler = MinMaxScaler()
    series_scaled = scaler.fit_transform(series.values.reshape(-1, 1))

    # Create sequences
    X, y = [], []
    for i in range(len(series_scaled) - 1):
        X.append(series_scaled[i:i+1])
        y.append(series_scaled[i+1])
    
    X, y = np.array(X), np.array(y)
    X = X.reshape((X.shape[0], X.shape[1], 1))

    # Build and train the LSTM model
    model = Sequential([
        LSTM(50, activation='relu', input_shape=(X.shape[1], 1)),
        Dense(1)
    ])
    model.compile(optimizer='adam', loss='mse')
    model.fit(X, y, epochs=100, verbose=0)

    # Predict the next value
    last_sequence = series_scaled[-1:].reshape((1, 1, 1))
    predicted_scaled = model.predict(last_sequence, verbose=0)
    
    # Inverse transform to get the actual value
    predicted_value = scaler.inverse_transform(predicted_scaled)[0][0]
    
    return float(predicted_value)

def _generate_chart_data(df: pd.DataFrame, group_by_column: str) -> dict:
    """
    Aggregates data, runs a forecast for the next year, and formats for Chart.js.
    """
    logger.info(f"Generating chart data grouped by {group_by_column}...")

    # 1. Aggregate historical data
    agg_df = df.groupby(['year', group_by_column])['budget'].sum().unstack(fill_value=0)
    
    # 2. Run forecast for each group
    forecast_year = agg_df.index.max() + 1 if not agg_df.empty else datetime.now().year + 1
    forecast_values = {}
    for col in agg_df.columns:
        historical_series = agg_df[col]
        forecast_values[col] = _run_lstm_forecast(historical_series)
    
    # 3. Append forecast to the aggregated data
    agg_df.loc[forecast_year] = forecast_values
    agg_df.fillna(0, inplace=True)

    # 4. Format for Chart.js
    labels = agg_df.index.astype(str).tolist()
    datasets = []
    
    # Define a color palette
    historical_colors = [
        '#42A5F5', '#FFA726', '#66BB6A', '#EF5350', '#AB47BC', '#78909C',
        '#26A69A', '#FF7043', '#9CCC65', '#D4E157', '#5C6BC0', '#8D6E63'
    ]
    forecast_color = '#BDBDBD' # Grey for forecast

    for i, column in enumerate(agg_df.columns):
        # Create a color array for this dataset: historical colors + grey for the last bar
        color_array = [historical_colors[i % len(historical_colors)]] * (len(labels) - 1)
        color_array.append(forecast_color)

        datasets.append({
            'label': column,
            'data': agg_df[column].tolist(),
            'backgroundColor': color_array,
        })
    
    logger.info(f"Finished generating chart data for {group_by_column}.")
    return {'labels': labels, 'datasets': datasets}


def _generate_gemini_analysis(chart_data: dict, view_by: str, api_key: str) -> dict:
    """Generates a textual analysis report using Gemini based on chart data."""
    logger.info(f"Starting Gemini analysis for forecast view: {view_by}")
    if not gemini_available or not api_key:
        raise ConnectionError("Gemini AI is not available or API key is not configured.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash')

    # Create a simplified text preview of the chart data for the prompt
    data_preview = f"Chart Data for view: {view_by}\n"
    data_preview += f"Years (Labels): {chart_data['labels']}\n"
    for dataset in chart_data['datasets']:
        label = dataset['label']
        data = ", ".join([f"₱{x:,.0f}" for x in dataset['data']])
        data_preview += f"- {label}: [{data}]\n"

    prompt = f'''
    You are a senior data analyst for a Sangguniang Kabataan (SK) council.
    Analyze the following project budget data, which has been prepared for a stacked bar chart.
    The data includes historical budget allocations and a new LSTM-based forecast for the final year.

    Data Preview:
    {data_preview}

    Your task is to generate a professional analysis report in a JSON format.
    The report should explain the patterns visible in the data, with special attention to the forecast year.

    Provide the following in your JSON response:
    1.  "summary": An executive summary of the key findings, including the overall budget trend and the significance of the forecast.
    2.  "trends": A list of 2-3 significant historical trends observed from the data.
    3.  "forecast_analysis": A specific analysis of the forecast. Explain what it implies for budget planning.
    4.  "recommendations": A list of 2-3 actionable recommendations based on the entire analysis (historical + forecast).
    5.  "confidence": Your confidence in the analysis as a float between 0.0 and 1.0.

    Generate ONLY the JSON object. Do not include markdown formatting (```json) or any other text.
    '''

    # Define the validation function for this specific report
    def is_valid_forecast_analysis(data):
        return 'summary' in data and 'recommendations' in data

    # Call the utility
    analysis_result = call_gemini_with_retry(model, prompt, is_valid_forecast_analysis)

    if analysis_result:
        logger.info(f"Successfully generated Gemini analysis for forecast view: {view_by}")
        return analysis_result
    else:
        logger.error(f"Failed to generate Gemini forecast analysis for {view_by} after multiple attempts.")
        return {
            "error": True,
            "message": f"Failed to generate Gemini forecast analysis for {view_by} after 5 attempts."
        }

def _process_data_for_forecast(df):
    """
    Prepares the DataFrame for forecasting.
    - Ensures 'start_date' is a datetime object.
    - Extracts 'year' from 'start_date'.
    - Ensures 'budget' is a numeric type.
    - Fills NaN values.
    """
    logger.info("Processing raw data for forecast...")
    if 'start_date' not in df.columns:
        raise ValueError("DataFrame must contain a 'start_date' column.")

    df['start_date'] = pd.to_datetime(df['start_date'], errors='coerce')
    df.dropna(subset=['start_date'], inplace=True)
    
    # The 'year' column should already exist from the reshaping step, but we ensure it.
    if 'year' not in df.columns:
        df['year'] = df['start_date'].dt.year

    budget_col = 'budget'
    if budget_col not in df.columns:
        # If no budget column, create it and fill with 0
        df[budget_col] = 0
    
    df[budget_col] = pd.to_numeric(df[budget_col], errors='coerce')
    df.fillna({budget_col: 0}, inplace=True)
    
    logger.info(f"Finished processing data. {len(df)} rows are ready for forecasting.")
    return df


def generate_forecast_report(df, api_key):
    """
    Main function to generate the complete forecast report, including chart data and analysis.

    Args:
        df (pd.DataFrame): The raw DataFrame containing all historical data.
        api_key (str): The Gemini API key.

    Returns:
        dict: A dictionary containing the full forecast report.
    """
    logger.info("--- Starting Full Forecast Report Generation ---")
    try:
        processed_df = _process_data_for_forecast(df.copy())

        # Generate data for both views
        committee_chart_data = _generate_chart_data(processed_df, 'committee')
        category_chart_data = _generate_chart_data(processed_df, 'category')

        # Generate analysis for both views using the chart data
        committee_analysis = _generate_gemini_analysis(committee_chart_data, 'committee', api_key)
        category_analysis = _generate_gemini_analysis(category_chart_data, 'category', api_key)

        # Combine into a single report structure
        report = {
            "by_committee": {
                "chart_data": committee_chart_data,
                "analysis": committee_analysis
            },
            "by_category": {
                "chart_data": category_chart_data,
                "analysis": category_analysis
            }
        }
        
        # Add metadata
        ph_tz = timezone(timedelta(hours=8))
        report['metadata'] = {
            'data_source': "Historical Data",
            'total_projects_analyzed': len(processed_df),
            'timestamp': datetime.now(ph_tz).isoformat(),
            'gemini_used': not (committee_analysis.get('error') or category_analysis.get('error')),
            'lstm_used': True
        }

        logger.info("--- Finished Full Forecast Report Generation ---")
        return report

    except Exception as e:
        logger.error(f"An unhandled error occurred in generate_forecast_report: {e}", exc_info=True)
        raise  # Re-raise the exception to signal failure to the caller
