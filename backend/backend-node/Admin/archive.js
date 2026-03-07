const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const accArchiveRouter = require('./accArchive');
const projArchiveRouter = require('./projArchive');

// Mount the specific archive routers
router.use('/accounts', accArchiveRouter);
router.use('/projects', projArchiveRouter);

module.exports = router;
