const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const uuidv4 = require('uuid4');
const path = require('path');

// --- Azure Storage Configuration with Fallback ---

const storageName = process.env.STORAGE_NAME;
const containerName = process.env.DOCS_CONTAINER;

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
if (!storageName || !containerName || !connectionString || !key) {
    throw new Error('Azure Storage environment variables are not sufficiently configured. Please check STORAGE_NAME, DOCS_CONTAINER, and at least one set of connection strings/keys.');
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
async function uploadFile(file) {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists({ access: 'private' });

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
 * @returns {Promise<string>} A temporary SAS URL for the blob.
 */
async function getFileSasUrl(blobName) {
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

module.exports = {
    uploadFile,
    getFileSasUrl,
};
