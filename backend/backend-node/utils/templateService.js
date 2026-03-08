const { getConnection, sql } = require('../database/database');
const { getBlobProperties, projectBatchContainerName } = require('../Storage/storage');

/**
 * Handle Phase 3 Template Automation
 */
class TemplateService {
    constructor() {
        // We now rely on Azure Blob Storage containers, not local directories.
    }

    /**
     * Map barangay ID to abbreviation
     */
    getBarangayAbbr(barangayID) {
        const mapping = {
            1: 'SB', // San Bartolome
            2: 'NN'  // Nagkaisang Nayon
        };
        return mapping[barangayID] || 'UNK';
    }

    /**
     * Ensure the physical Excel file is up-to-date with the database.
     * Compares the latest projectAuditTrail entry with the file's last modified time.
     */
    async ensureExcelUpToDate(batchID) {
        try {
            const pool = await getConnection();

            // 1. Get Batch Info and naming convention
            const batchResult = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query('SELECT projType, targetYear, barangayID FROM projectBatch WHERE batchID = @batchID');

            if (!batchResult.recordset.length) throw new Error('Batch not found');

            const { projType, targetYear, barangayID } = batchResult.recordset[0];
            const abbr = this.getBarangayAbbr(barangayID);
            const fileName = `${projType}_${abbr}_${targetYear}.xlsx`;

            // Check if file exists in Azure
            const blobProps = await getBlobProperties(projectBatchContainerName, fileName);

            if (!blobProps) {
                // If it doesn't exist, we must sync it
                console.log(`File not found in Azure, triggering sync for batch ${batchID}`);
                return await this.triggerPythonSync(batchID);
            }

            // 2. Get latest Audit Trail timestamp for this batch
            const auditResult = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query('SELECT TOP 1 [timestamp] FROM projectAuditTrail WHERE batchID = @batchID ORDER BY [timestamp] DESC');

            // 3. Get File Mtime from Azure properties
            const fileMtime = new Date(blobProps.lastModified);

            // 4. Compare
            if (auditResult.recordset.length) {
                const dbTime = new Date(auditResult.recordset[0].timestamp);
                if (dbTime > fileMtime) {
                    console.log(`DB data is newer than file (${dbTime} > ${fileMtime}), syncing...`);
                    return await this.triggerPythonSync(batchID);
                }
            }

            console.log(`Excel file for batch ${batchID} is up-to-date in Azure.`);
            return true;
        } catch (error) {
            console.error('Error in ensureExcelUpToDate:', error);
            return false;
        }
    }

    /**
     * Trigger the Python Microservice to sync the Excel file
     */
    async triggerPythonSync(batchID) {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const axios = require('axios');
        const { downloadBlobToBuffer, uploadBlob, projectBatchContainerName } = require('../Storage/storage');
        let tempFilePath = null;

        try {
            const pool = await getConnection();
            const batchResult = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query('SELECT projType, targetYear, barangayID FROM projectBatch WHERE batchID = @batchID');

            if (batchResult.recordset.length === 0) return false;

            const { projType, targetYear, barangayID } = batchResult.recordset[0];
            const abbr = this.getBarangayAbbr(barangayID);
            const fileName = `${projType}_${abbr}_${targetYear}.xlsx`;

            // 1. Download existing blob to temp file
            const fileBuffer = await downloadBlobToBuffer(projectBatchContainerName, fileName);
            tempFilePath = path.join(os.tmpdir(), `sync_${Date.now()}_${fileName}`);
            fs.writeFileSync(tempFilePath, fileBuffer);

            // 2. Trigger Python
            const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
            const response = await axios.post(`${aiServiceUrl}/sync-project`, {
                batch_id: batchID,
                file_path: tempFilePath
            });

            if (response.data.status !== 'ok') {
                throw new Error('Python sync failed');
            }

            // 3. Upload modified file back to Azure
            const modifiedBuffer = fs.readFileSync(tempFilePath);
            await uploadBlob(projectBatchContainerName, fileName, modifiedBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

            // 4. Cleanup
            fs.unlinkSync(tempFilePath);

            return true;
        } catch (error) {
            console.error('Failed to trigger Python sync:', error.message);
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch (e) { }
            }
            return false;
        }
    }

    /**
     * Primary logic for creating a new project batch and template
     */
    async initializeNewProject(data) {
        const { barangayID, projType, targetYear, budget, userID, governance_pct, active_citizenship_pct, economic_empowerment_pct, global_mobility_pct, agriculture_pct, environment_pct, PBS_pct, SIE_pct, education_pct, health_pct } = data;

        try {
            const pool = await getConnection();
            // 1. Generate naming convention
            const abbr = this.getBarangayAbbr(barangayID);
            const newFileName = `${projType}_${abbr}_${targetYear}.xlsx`;
            const destinationPath = `azure:${projectBatchContainerName}/${newFileName}`;

            // 2. Call Stored Procedure to create DB entries (projectBatch + initial projectTracker)
            const result = await pool.request()
                .input('barangayID', sql.Int, barangayID)
                .input('projType', sql.NVarChar, projType)
                .input('projName', sql.NVarChar, newFileName)
                .input('targetYear', sql.NVarChar, targetYear)
                .input('budget', sql.Decimal(18, 2), budget || 0)
                .input('userID', sql.Int, userID)
                .input('governance_pct', sql.Decimal(5, 2), governance_pct || 0)
                .input('active_citizenship_pct', sql.Decimal(5, 2), active_citizenship_pct || 0)
                .input('economic_empowerment_pct', sql.Decimal(5, 2), economic_empowerment_pct || 0)
                .input('global_mobility_pct', sql.Decimal(5, 2), global_mobility_pct || 0)
                .input('agriculture_pct', sql.Decimal(5, 2), agriculture_pct || 0)
                .input('environment_pct', sql.Decimal(5, 2), environment_pct || 0)
                .input('PBS_pct', sql.Decimal(5, 2), PBS_pct || 0)
                .input('SIE_pct', sql.Decimal(5, 2), SIE_pct || 0)
                .input('education_pct', sql.Decimal(5, 2), education_pct || 0)
                .input('health_pct', sql.Decimal(5, 2), health_pct || 0)
                .execute('sp_InitializeProjectBatch');

            const batchID = result.recordset[0].batchID;

            // 3. Trigger Python microservice to handle duplication and modification
            const axios = require('axios');

            const templateName = `${projType}_TEMPLATE_${abbr}.xlsx`;
            const skLogoName = `logos/sk_logo.png`;
            const brgyLogoName = `logos/${abbr}.png`;

            const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
            const aiResponse = await axios.post(`${aiServiceUrl}/initialize-project`, {
                batch_id: batchID,
                barangay_id: barangayID,
                proj_type: projType,
                target_year: targetYear,
                file_path: newFileName,
                template_name: templateName,
                sk_logo_path: skLogoName,
                brgy_logo_path: brgyLogoName
            });

            if (aiResponse.data.status !== 'ok') {
                throw new Error('Python microservice failed to initialize project.');
            }

            return {
                success: true,
                batchID: batchID,
                fileName: newFileName,
                filePath: destinationPath // Reference string for frontend/logging purposes
            };

        } catch (error) {
            console.error('Error in TemplateService.initializeNewProject:', error);
            throw error;
        }
    }
}

module.exports = new TemplateService();
