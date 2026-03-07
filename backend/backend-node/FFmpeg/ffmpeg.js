
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Function to compress a video buffer
const compressVideo = (buffer, originalName) => {
    return new Promise((resolve, reject) => {
        const tempInputPath = path.join(os.tmpdir(), `input-${originalName}`);
        const tempOutput1 = path.join(os.tmpdir(), `output-1-${originalName}`);
        const tempOutput2 = path.join(os.tmpdir(), `output-2-${originalName}`);
        const tempOutput3 = path.join(os.tmpdir(), `output-3-${originalName}`);
        const tempFiles = [tempInputPath, tempOutput1, tempOutput2, tempOutput3];

        const cleanup = () => {
            tempFiles.forEach(file => fs.unlink(file, () => {}));
        };

        fs.writeFile(tempInputPath, buffer, (err) => {
            if (err) {
                return reject(err);
            }

            // Step 1: Reduce resolution to 720p
            ffmpeg(tempInputPath)
                .outputOptions('-vf', 'scale=-2:720')
                .save(tempOutput1)
                .on('end', () => {
                    const stats = fs.statSync(tempOutput1);
                    if (stats.size <= 25 * 1024 * 1024) {
                        fs.readFile(tempOutput1, (err, data) => {
                            cleanup();
                            if (err) return reject(err);
                            return resolve(data);
                        });
                        return;
                    }

                    // Step 2: Reduce bitrate to 1000k
                    ffmpeg(tempOutput1)
                        .outputOptions('-b:v', '1000k')
                        .save(tempOutput2)
                        .on('end', () => {
                            const stats2 = fs.statSync(tempOutput2);
                            if (stats2.size <= 25 * 1024 * 1024) {
                                fs.readFile(tempOutput2, (err, data) => {
                                    cleanup();
                                    if (err) return reject(err);
                                    return resolve(data);
                                });
                                return;
                            }

                            // Step 3: Reduce framerate to 24fps
                            ffmpeg(tempOutput2)
                                .outputOptions('-r', '24')
                                .save(tempOutput3)
                                .on('end', () => {
                                    const stats3 = fs.statSync(tempOutput3);
                                    if (stats3.size > 25 * 1024 * 1024) {
                                        cleanup();
                                        return reject(new Error('Video compression failed to reduce file size under 25MB.'));
                                    }
                                    fs.readFile(tempOutput3, (err, data) => {
                                        cleanup();
                                        if (err) return reject(err);
                                        resolve(data);
                                    });
                                })
                                .on('error', (err) => {
                                    cleanup();
                                    reject(err);
                                });
                        })
                        .on('error', (err) => {
                            cleanup();
                            reject(err);
                        });
                })
                .on('error', (err) => {
                    cleanup();
                    reject(err);
                });
        });
    });
};

module.exports = { compressVideo };
