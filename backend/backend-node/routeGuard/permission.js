const { getConnection, sql } = require('../database/database');

const checkRole = (allowedRoles) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication failed' });
        }

        try {
            const userPosition = req.user.position;

            if (allowedRoles.includes(userPosition)) {
                return next();
            }

            // Fallback to check database if role not in token
            const pool = await getConnection();
            const result = await pool.request()
                .input('userId', sql.Int, req.user.userId)
                .query(`
                    SELECT r.roleName as position
                    FROM userInfo u
                    JOIN roles r ON u.position = r.roleID
                    WHERE u.userID = @userId
                `);

            if (result.recordset.length > 0 && allowedRoles.includes(result.recordset[0].position)) {
                return next();
            }

            return res.status(403).json({ success: false, message: 'Access denied. You do not have the required permissions.' });

        } catch (error) {
            console.error('Error checking role permissions:', error);
            return res.status(500).json({ success: false, message: 'An error occurred while verifying permissions.' });
        }
    };
};

module.exports = { checkRole };
