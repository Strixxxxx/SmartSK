const getPHTimestamp = () => {
    const now = new Date();
    const offset = 8 * 60; // GMT+8 in minutes
    const localNow = new Date(now.getTime() + (offset * 60 * 1000));
    return localNow;
};

module.exports = { getPHTimestamp };
