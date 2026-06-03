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
        
        // Check if the content is empty (e.g., file was just created but not fully uploaded)
        if (!downloadedContent || downloadedContent.trim() === '') {
            const err = new Error('empty_blob');
            err.statusCode = 404;
            err.code = 'REPORT_PROCESSING';
            throw err;
        }
        
        // Parse the content.
        return JSON.parse(downloadedContent);

    } catch (error) {
        // Catch incomplete JSON strings
        if (error instanceof SyntaxError && error.message.includes('Unexpected end of JSON input')) {
            const err = new Error('empty_blob');
            err.statusCode = 404;
            err.code = 'REPORT_PROCESSING';
            throw err;
        }

        // Only log actual errors, not our custom processing ones
        if (error.code !== 'REPORT_PROCESSING' && error.statusCode !== 404) {
            console.error(`Failed to retrieve or parse report '${reportName}':`, error);
        }
        // Re-throw the original error, as the router is equipped to handle status codes.
        throw error;
    }
}

module.exports = { getReport };

