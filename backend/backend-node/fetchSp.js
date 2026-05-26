const { getConnection } = require('./database/database.js'); 
async function run() { 
    try { 
        const pool = await getConnection(); 
        const result = await pool.request().query("SELECT OBJECT_DEFINITION(OBJECT_ID('sp_InitializeProjectBatch')) AS sp_text"); 
        console.log(result.recordset[0].sp_text); 
        process.exit(0); 
    } catch(e) { 
        console.error(e); 
        process.exit(1); 
    } 
} 
run();
