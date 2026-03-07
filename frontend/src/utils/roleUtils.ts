/**
 * Utility functions for user role formatting and management.
 */

export const ROLE_NAME_MAP: Record<string, string> = {
    "SKC": "SK Chairperson",
    "SKS": "SK Secretary",
    "SKT": "SK Treasurer",
    "SKK1": "SK Kagawad I",
    "SKK2": "SK Kagawad II",
    "SKK3": "SK Kagawad III",
    "SKK4": "SK Kagawad IV",
    "SKK5": "SK Kagawad V",
    "SKK6": "SK Kagawad VI",
    "SKK7": "SK Kagawad VII",
    "Admin": "Administrator"
};

/**
 * Formats a role or position code into a full, professional name.
 * @param roleCode The shorthand code for the role (e.g., 'SKS').
 * @returns The full role name if a mapping exists, otherwise the original string.
 */
export const formatRoleName = (roleCode: string | undefined): string => {
    if (!roleCode) return 'User';
    return ROLE_NAME_MAP[roleCode] || roleCode;
};
