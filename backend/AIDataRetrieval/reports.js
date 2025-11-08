const express = require('express');
const router = express.Router();
const { getReport } = require('./dataRetrieve');

/**
 * @route   GET /api/reports/forecast
 * @desc    Get the pre-generated forecast report.
 * @access  Private (Protected by authMiddleware in main.js)
 */
router.get('/forecast', async (req, res) => {
    try {
        const reportData = await getReport('forecast.json');
        res.json(reportData);
    } catch (error) {
        res.status(error.statusCode || 500).json({ 
            message: `Failed to retrieve forecast report.`,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/reports/pa-analysis
 * @desc    Get the pre-generated predictive analysis report.
 * @access  Private
 */
router.get('/pa-analysis', async (req, res) => {
    try {
        const reportData = await getReport('pa_analysis.json');
        res.json(reportData);
    } catch (error) {
        res.status(error.statusCode || 500).json({ 
            message: `Failed to retrieve predictive analysis report.`,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/reports/pa-trends
 * @desc    Get the pre-generated predictive trends report.
 * @access  Private
 */
router.get('/pa-trends', async (req, res) => {
    try {
        const reportData = await getReport('pa_trends.json');
        res.json(reportData);
    } catch (error) {
        res.status(error.statusCode || 500).json({ 
            message: `Failed to retrieve predictive trends report.`,
            error: error.message
        });
    }
});

module.exports = router;
