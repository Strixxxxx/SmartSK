const { getConnection } = require('./database/database.js'); 
async function run() { 
    try { 
        const pool = await getConnection(); 
        const result = await pool.request().query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'projectBatch';
        `); 
        console.log(result.recordset); 
        process.exit(0); 
    } catch(e) { 
        console.error(e); 
        process.exit(1); 
    } 
} 
run();
