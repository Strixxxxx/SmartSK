const { getBlobContent, jsonContainerName } = require('../Storage/storage');

/**
 * Downloads and parses a specific JSON report from Azure Blob Storage
 * using the centralized storage module.
 * @param {string} reportName The name of the blob to download (e.g., 'forecast.json').
 * @returns {Promise<Object>} A promise that resolves to the parsed JSON object.
 */
async function getReport(reportName) {
    if (!jsonContainerName) {
        // This check is a safeguard, but storage.js should have already validated it.
        throw new Error('JSON container name is not configured in the central storage module.');
    }

    try {
        // Use the centralized function to get the blob content.
        const downloadedContent = await getBlobContent(jsonContainerName, reportName);
        
        // Parse the content.
        return JSON.parse(downloadedContent);

    } catch (error) {
        console.error(`Failed to retrieve or parse report '${reportName}':`, error);
        // Re-throw the original error, as the router is equipped to handle status codes.
        throw error;
    }
}

module.exports = { getReport };

