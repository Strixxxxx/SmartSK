const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const uuidv4 = require('uuid4');
const path = require('path');

// --- Azure Storage Configuration with Fallback ---

const storageName = process.env.STORAGE_NAME;
const imageContainerName = process.env.IMAGE_CONTAINER;
const videoContainerName = process.env.VIDEO_CONTAINER;
const docContainerName = process.env.DOCS_CONTAINER;
const backupContainerName = process.env.BACKUP_CONTAINER;
const eAttachContainerName = process.env.E_ATTACHMENTS; // New container

// Primary credentials
const primaryConnectionString = process.env.STORAGE_CONNECTION_STRING_1;
const primaryKey = process.env.STORAGE_KEY_1;

// Secondary (fallback) credentials
const secondaryConnectionString = process.env.STORAGE_CONNECTION_STRING_2;
const secondaryKey = process.env.STORAGE_KEY_2;

// Determine which credentials to use
const useSecondary = !primaryConnectionString || !primaryKey;
const connectionString = useSecondary ? secondaryConnectionString : primaryConnectionString;
const key = useSecondary ? secondaryKey : primaryKey;

// Validate that at least one set of credentials and essential info are present
if (!storageName || !imageContainerName || !videoContainerName || !docContainerName || !backupContainerName || !eAttachContainerName || !connectionString || !key) {
    throw new Error('Azure Storage environment variables are not sufficiently configured. Please check STORAGE_NAME, IMAGE_CONTAINER, VIDEO_CONTAINER, DOCS_CONTAINER, BACKUP_CONTAINER, E_ATTACHMENTS and at least one set of connection strings/keys.');
}

console.log(`Initializing Azure Storage with ${useSecondary ? 'secondary' : 'primary'} credentials.`);

// --- Client and Credential Initialization ---

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const sharedKeyCredential = new StorageSharedKeyCredential(storageName, key);

/**
 * Uploads a file to Azure Blob Storage.
 * @param {import('multer').File} file - The file object from multer (with buffer).
 * @returns {Promise<string>} The name of the uploaded blob.
 */
async function uploadFile(file, isPublic) {
    console.log(`Uploading file with mimetype: ${file.mimetype}, isPublic: ${isPublic}`);
    
    let containerName;
    const mimetype = file.mimetype;

    if (isPublic) {
        if (mimetype.startsWith('image')) {
            containerName = imageContainerName;
        } else if (mimetype.startsWith('video')) {
            containerName = videoContainerName;
        } else {
            containerName = docContainerName;
        }
    } else {
        // All secure files go to the encrypted attachments container
        containerName = eAttachContainerName;
    }

    if (!containerName) {
        throw new Error(`Could not determine container for file: ${file.originalname}`);
    }

    console.log(`Selected container: ${containerName}`);
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    // Blob name no longer has a prefix
    const blobName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype }
    });
    return blobName;
}

/**
 * Generates a temporary SAS URL for a blob.
 * @param {string} blobName - The name of the blob to generate a URL for.
 * @param {string} fileType - The MIME type of the file.
 * @returns {Promise<string>} A temporary SAS URL for the blob.
 */
async function getFileSasUrl(blobName, fileType, isPublic, source = 'post') {
    let containerName;
    const mimetype = fileType || '';
    console.log(`Generating SAS URL for blob: ${blobName}, isPublic: ${isPublic}, source: ${source}`);

    if (source === 'project') {
        // Project attachments are always public documents
        containerName = docContainerName;
    } else if (!isPublic) {
        // Secure post attachments can be any file type and are always in the encrypted container
        containerName = eAttachContainerName;
    } else {
        // Public post attachments can only be images or videos
        if (mimetype.startsWith('image')) {
            containerName = imageContainerName;
        } else if (mimetype.startsWith('video')) {
            containerName = videoContainerName;
        }
    }

    if (!containerName) {
        throw new Error(`Could not determine container for blob: ${blobName} with source: ${source} and mimetype: ${mimetype}`);
    }
    
    console.log(`Determined container: ${containerName}`);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);

    const sasOptions = {
        containerName: containerName,
        blobName: blobName,
        startsOn: new Date(),
        expiresOn: new Date(new Date().valueOf() + 60 * 60 * 1000), // 1 hour
        permissions: BlobSASPermissions.parse("r"), // Read permission
    };

    const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
    return `${blobClient.url}?${sasToken}`;
}

/**
 * Uploads a local file to the backup container in Azure Blob Storage.
 * @param {string} filePath - The local path to the file to upload.
 * @param {string} blobName - The name for the blob in Azure.
 * @returns {Promise<void>}
 */
async function uploadBackupFile(filePath, blobName) {
    console.log(`Uploading backup file to container: ${backupContainerName}`);
    const containerClient = blobServiceClient.getContainerClient(backupContainerName);
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadFile(filePath);
    console.log(`Successfully uploaded ${blobName} to container ${backupContainerName}.`);
    return blockBlobClient.url;
}

/**
 * Lists all backups in the backup container.
 * @returns {Promise<Array<{name: string, createdOn: Date, size: number}>>} A list of backup files.
 */
async function listBackups() {
    const containerClient = blobServiceClient.getContainerClient(backupContainerName);
    await containerClient.createIfNotExists();
    const backups = [];
    for await (const blob of containerClient.listBlobsFlat()) {
        backups.push({
            name: blob.name,
            createdOn: blob.properties.createdOn,
            size: blob.properties.contentLength
        });
    }
    // Sort by creation date, newest first
    return backups.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
}

/**
 * Downloads a blob from the backup container to a local file path.
 * @param {string} blobName - The name of the blob to download.
 * @param {string} downloadPath - The local path to save the file to.
 * @returns {Promise<void>}
 */
async function downloadBackupFile(blobName, downloadPath) {
    const containerClient = blobServiceClient.getContainerClient(backupContainerName);
    const blobClient = containerClient.getBlobClient(blobName);

    await blobClient.downloadToFile(downloadPath);
    console.log(`Successfully downloaded ${blobName} to ${downloadPath}.`);
}

/**
 * Deletes a blob from Azure Storage.
 * @param {string} blobName - The name of the blob to delete.
 * @param {string} fileType - The MIME type of the file.
 * @param {boolean} isPublic - Whether the file is in a public container.
 * @returns {Promise<void>}
 */
async function deleteFile(blobName, fileType, isPublic) {
    let containerName;
    const mimetype = fileType || '';

    if (!isPublic) {
        containerName = eAttachContainerName;
    } else {
        if (mimetype.startsWith('image')) {
            containerName = imageContainerName;
        } else if (mimetype.startsWith('video')) {
            containerName = videoContainerName;
        } else {
            containerName = docContainerName;
        }
    }

    if (!containerName) {
        throw new Error(`Could not determine container for blob: ${blobName} to delete.`);
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);

    try {
        await blobClient.delete();
        console.log(`Successfully deleted blob ${blobName} from container ${containerName}.`);
    } catch (error) {
        // If the blob doesn't exist, Azure throws a 404 error. We can often ignore this.
        if (error.statusCode === 404) {
            console.warn(`Blob ${blobName} not found in container ${containerName}. It may have already been deleted.`);
        } else {
            throw error; // Re-throw other errors
        }
    }
}

module.exports = {
    uploadFile,
    getFileSasUrl,
    uploadBackupFile,
    listBackups,
    downloadBackupFile,
    deleteFile, // Export the new function
};
