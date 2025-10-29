# Backend Documentation

This document provides an overview of the backend structure and functionality of the smartSK application.

## Directory Structure

```
backend/
├── Admin/
├── AI/
├── audit/
├── config/
├── database/
├── Email/
├── FFmpeg/
├── forgotpassword/
├── login/
├── Posting/
├── projectReview/
├── Projects/
├── projectSubmission/
├── pyBridge/
├── rawdata/
├── routeGuard/
├── session/
├── Storage/
├── utils/
└── websockets/
```

---

## Packages and Libraries

This section lists all the Node.js and Python packages used in the backend.

### Node.js (`package.json`)

-   `@azure/arm-sql`: For Azure SQL management.
-   `@azure/identity`: For Azure authentication.
-   `@azure/storage-blob`: For interacting with Azure Blob Storage.
-   `archiver`: For creating zip archives.
-   `archiver-zip-encrypted`: For creating encrypted zip archives.
-   `axios`: For making HTTP requests.
-   `bcrypt`: For hashing passwords.
-   `cors`: For enabling Cross-Origin Resource Sharing.
-   `csv-parser`: For parsing CSV files.
-   `dotenv`: For loading environment variables from a `.env` file.
-   `express`: Web framework for Node.js.
-   `fluent-ffmpeg`: A fluent API for FFmpeg.
-   `jsonwebtoken`: For creating and verifying JSON Web Tokens.
-   `mssql`: Microsoft SQL Server client for Node.js.
-   `multer`: Middleware for handling `multipart/form-data`, used for file uploads.
-   `node-cron`: A simple cron-like job scheduler.
-   `nodemailer`: For sending emails.
-   `pdf-parse`: For parsing PDF files.
-   `uuid4`: For generating UUIDs.
-   `ws`: A WebSocket implementation for Node.js.

### Python (`requirements.txt`)

-   `pandas`: For data manipulation and analysis.
-   `numpy`: For numerical operations.
-   `pyodbc`: For connecting to ODBC databases, including SQL Server.
-   `google-generativeai`: Google's library for their generative AI models (Gemini).
-   `google-api-python-client`: Google API client for Python.
-   `better-profanity`: For filtering out profanity.
-   `requests`: For making HTTP requests.
-   `python-dotenv`: For loading environment variables from a `.env` file.

---

### `Admin`

This directory contains all the logic for administrative functions, such as account management, backups, and viewing logs.

#### `accArchive.js`

Handles the archiving and restoration of user accounts.

-   **`GET /`**: Fetches all archived user accounts from the `userInfo` table where `isArchived` is `1`. It decrypts user details before sending them.
-   **`POST /:userId`**: Archives a single user account by setting its `isArchived` flag to `1`. It records this action in the audit trail.
-   **`POST /restore/:userId`**: Restores an archived user account by setting its `isArchived` flag to `0`. It also records this action in the audit trail.

#### `accountCreation.js`

Manages the creation and listing of user accounts by administrators.

-   **`GET /`**: Retrieves a list of all non-archived users. Access is restricted to Master Admins (`MA`) and System Admins (`SA`). It decrypts user information before sending.
-   **`POST /create-account`**: Creates a new user account. It performs validation (required fields, email domain), checks for existing username/email, hashes the password, encrypts sensitive user data, and inserts the new user into the database. It then sends an account creation email. Access is restricted to `MA` and `SA`.

#### `archive.js`

This file acts as a router to group account and project archiving functionalities.

-   **`/accounts`**: Mounts the `accArchiveRouter` to handle account-related archiving.
-   **`/projects`**: Mounts the `projArchiveRouter` to handle project-related archiving.

#### `backup.js`

Manages the database backup and restore functionality, including integration with Azure Blob Storage.

-   **`GET /`**: Lists all available backups from the configured Azure Blob Storage container.
-   **`POST /`**: Initiates a new database backup process. It accepts a `backupType` ('hybrid' or 'cloud-only') and creates a background job to perform the backup.
-   **`GET /status/:jobId`**: Polls for the status of a specific backup or restore job.
-   **`GET /download/:jobId`**: Allows downloading a completed 'hybrid' backup. It streams the backup file from Azure, zips it with encryption on-the-fly, and sends it to the user.
-   **`POST /restore`**: Initiates an asynchronous database restore process from either a local upload (`.zip`) or a cloud backup. It activates maintenance mode during the restore.
-   **`POST /maintenance-start`**: Manually activates maintenance mode.

#### `backupJob.js`

Provides helper functions for creating, retrieving, and updating backup/restore job records in the `BackupJobs` database table.

-   **`createJob(details)`**: Creates a new job record in the database with a unique UUID and returns the `jobId`.
-   **`getJob(jobId)`**: Retrieves a job's details from the database by its ID.
-   **`updateJob(jobId, status, message, data)`**: Updates the status, message, and other properties of a job in the database.
-   **`cleanupJobs()`**: A periodic function (runs every hour) that deletes old, expired job records from the database.

#### `projArchive.js`

Handles the archiving and restoration of projects.

-   **`GET /`**: Fetches all archived projects from the `projectsARC` table, decrypting project details before sending.
-   **`POST /:projectId`**: Archives a project by executing the `prjArchived` stored procedure, which moves the project from the `projects` table to the `projectsARC` table.
-   **`POST /restore/:projectId`**: Restores a project by executing the `prjReturn` stored procedure, which moves the project back from `projectsARC` to the `projects` table.
-   **`GET /file-url/:projectID`**: Generates a temporary Secure Access Signature (SAS) URL for downloading the file associated with an archived project from Azure Blob Storage.

#### `projList.js`

Fetches a list of projects for an administrator based on their assigned barangay.

-   **`GET /`**: Retrieves all projects for the logged-in admin's barangay. It decrypts project details before sending.
-   **`GET /file-url/:projectID`**: Generates a temporary SAS URL for downloading a project's associated file.

#### `roles.js`

Manages user roles and permissions.

-   **`GET /users`**: Retrieves a list of all non-archived users along with their assigned roles and barangays. Decrypts user data.
-   **`GET /all`**: Returns a static list of all available roles in the system (MA, SA, SKC, SKO).
-   **`GET /:roleId/permissions`**: Fetches the permissions associated with a specific role ID.
-   **`POST /assignRole`**: Assigns a new role (position) to a user.
-   **`POST /create`**: Creates a new role (Not fully implemented, seems to be a duplicate of assign).
-   **`DELETE /:roleId`**: Deletes a role and its associated permissions.

#### `sessionlog.js`

Provides an endpoint to view user session logs.

-   **`GET /`**: Fetches all session logs from the `sessions` table. It can be filtered by a `startDate` and `endDate`. It joins with `userInfo` to get user details and decrypts them.

---

### `AI`

This directory contains Python scripts for Artificial Intelligence functionalities, including forecasting and predictive analysis, primarily using Google's Gemini model.

#### `__init__.py`

An empty file that marks the `AI` directory as a Python package, allowing modules within it to be imported by other scripts.

#### `db_utils.py`

A utility module for database interactions used by the AI scripts.

-   **`get_raw_data_from_db(category=None)`**: Connects to the SQL Server database using credentials from environment variables and executes the `[Raw Data]` stored procedure to fetch project data. It can filter data by category. The data is returned as a list of dictionaries.

#### `forecast.py`

Generates forecast data and analysis for project budgets.

-   **`process_db_data(df)`**: Cleans and processes the raw data from the database, ensuring budget columns are numeric and handling missing values.
-   **`generate_chart_data(df, group_by_col)`**: Structures the processed data into a format suitable for creating stacked bar charts, grouped by a specified column (e.g., 'Committee' or 'Category').
-   **`generate_gemini_analysis(df, view_by)`**: Constructs a detailed prompt with data context and sends it to the Gemini AI model to generate a JSON report containing a summary, trends, recommendations, and a chart explanation.
-   **`main()`**: The main execution block that fetches data, processes it, and either generates chart data or a full AI-powered analysis based on command-line arguments (`--analysis`, `--view_by`).

#### `pa.py`

Performs predictive analysis on project data, enhanced with real-time web search results.

-   **`process_db_data(df)`**: Processes the raw database DataFrame, similar to `forecast.py`.
-   **`perform_web_search(query, num_results)`**: Uses the Google Programmable Search Engine (PSE) to search for trends related to a given query and formats the results.
-   **`generate_gemini_analysis(df, view_by, ...)`**: The core analysis function. It combines historical data with web search results to generate a comprehensive predictive report from the Gemini model. The report includes success factors, recommendations, risk mitigation, predicted trends, and detailed analysis on budget, implementation dates, and duration.
-   **`main()`**: Main function that orchestrates the process: fetching data, processing it, generating the Gemini analysis, and printing the final JSON output. It takes filter options (like category) as a JSON string from the command line.

#### `paCstm.py`

Provides a more customized version of the predictive analysis, allowing the user to select which sections to include in the final report.

-   **`process_db_data(df)`**: Standard data processing function.
-   **`perform_web_search(query, num_results)`**: Standard web search function.
-   **`generate_gemini_analysis(df, options)`**: Dynamically builds a prompt for the Gemini model based on the user's selected options (e.g., `include_trends`, `include_budget`). This allows for a tailored analysis report.
-   **`main()`**: Parses a JSON object of options from the command line, fetches data, generates the customized analysis, and prints the result.

#### `paCstmTrends.py`

Generates a list of top 10 project trend ideas based on a combination of historical data and real-time web searches, with a focus on a user-selected category.

-   **`search_internet_for_trends(search_query)`**: Performs a web search for the given query.
-   **`generate_trends_prompt(...)`**: Creates a detailed prompt for the Gemini model, instructing it to weigh historical data (70%) and web search data (30%) to generate 10 trend ideas.
-   **`get_ai_response(prompt)`**: Sends the prompt to Gemini and parses the JSON response.
-   **`main(custom_category, other_category, forecast_year)`**: The main function that takes a category (and optional free-text category), fetches data, performs the web search, generates the AI response, and adds metadata before printing the final JSON. It includes a profanity filter for custom categories.

#### `paTrends.py`

Generates project trend forecasts by combining historical data from the database with real-time web search results.

-   **`process_db_data(df)`**: Standard data processing.
-   **`get_categories_from_db()`**: Fetches a list of unique project categories from the database.
-   **`search_internet_for_trends(...)`**: Performs a broad web search across multiple predefined SK project categories to gather context.
-   **`generate_trends_prompt_with_weights(...)`**: Creates a prompt for the Gemini model, instructing it to give 70% weight to historical data and 30% to web search data when generating trend ideas.
-   **`generate_project_trends(filters, forecast_year)`**: The main logic function that orchestrates data fetching, web searching, prompt generation, and AI response processing.
-   **`main()`**: Parses command-line arguments for filters (like category and year) and calls `generate_project_trends`.

---

### `audit`

This directory handles the creation and retrieval of audit trail logs.

#### `auditService.js`

-   **`generateAuditID(actor, module)`**: Creates a unique ID for an audit entry based on the current timestamp and codes for the actor and module.
-   **`addAuditTrail({ ... })`**: An asynchronous function that inserts a new record into the `[audit trail]` table in the database. It maps a module code (e.g., 'P' for Projects) to its full name.
-   **`GET /`**: An Express route that fetches all records from the audit trail table, joining with the `userInfo` table to get the username of the actor. It decrypts the username before sending the response.

---

### `config`

This directory contains configuration files for different parts of the application.

#### `jwt.js`

Exports the JWT (JSON Web Token) configuration, including the secret key (from `process.env.JWT_SECRET_KEY`) and the token expiration time (`24h`).

---

### `database`

This directory is responsible for database connections and schema definitions.

#### `database.js`

-   Configures and creates a connection pool for the Microsoft SQL Server database using credentials from environment variables (`.env` file).
-   It handles connection events and initial connection errors.
-   Exports `getConnection` to provide access to the connection pool and `sql` for using `mssql` data types.

#### `database_query.txt`

A text file containing the SQL queries used to set up the initial database schema, including table creations, insertions of initial data (like roles and barangays), and stored procedures for archiving and data compilation.

---

### `Email`

Handles all email-sending functionalities.

#### `email.js`

-   Configures `nodemailer` to send emails using a Gmail account with credentials from environment variables.
-   Contains functions that generate HTML email templates for various actions:
    -   `createAccountCreationEmail`
    -   `createPasswordResetEmail`
    -   `createAccountApprovalEmail`
    -   `createAccountRejectionEmail`
    -   `createProjectStatusEmail`
-   Provides functions to send these emails:
    -   `sendPasswordResetEmail`: Sends an email with a 6-digit OTP.
    -   `sendAccountApprovalEmail`: Sends an approval notification.
    -   `sendAccountRejectionEmail`: Sends a rejection notification.
    -   `sendAccountCreationEmail`: Sends welcome email with default credentials.
    -   `sendProjectStatusEmail`: Sends an email about a project's status change.
-   Exposes an Express router for a `/send-password-reset` endpoint.

---

### `FFmpeg`

Contains logic for video processing.

#### `ffmpeg.js`

-   **`compressVideo(buffer, originalName)`**: A function that takes a video buffer and compresses it to be under 25MB. It performs a multi-step compression process:
    1.  Reduces resolution to 720p.
    2.  If still too large, reduces bitrate to 1000k.
    3.  If still too large, reduces framerate to 24fps.
    It uses temporary files for processing and cleans them up afterward.

---

### `forgotpassword`

Manages the entire "forgot password" flow.

#### `forgotPassword.js`

-   **`POST /request`**: Handles the initial password reset request. It identifies the user by username or email (using secure hashes), generates a 6-digit OTP, sends it via email, and stores the hashed OTP in the `otpStore` table with a 5-minute expiration.
-   **`POST /verify-otp`**: Verifies the OTP provided by the user against the hashed OTP in the database. It includes protection against expired codes and multiple failed attempts.
-   **`POST /reset`**: Resets the user's password after a successful OTP verification. It validates the new password against complexity requirements, hashes it, and updates the user's `passKey` in the database.

---

### `login`

Handles user authentication and credential management.

#### `login.js`

-   **`POST /`**: The main login endpoint. It finds the user by username or email hash, verifies the barangay, checks for archived status, and compares the provided password with the stored bcrypt hash. On success, it creates a new session, generates a JWT, and returns it to the user along with user details.
-   **`POST /logout`**: Logs the user out by expiring their current session in the database.
-   **`POST /change-credentials`**: Allows a user to change their username and password, but only if they are currently using a default password (`isDefaultPassword = 1`). It validates the new username for uniqueness and updates the credentials.
-   **`GET /validate-token`**: An endpoint to validate the current user's token.

---

### `Posting`

This directory contains the logic for creating and retrieving public-facing posts for the portfolio/gallery feature.

#### `post.js`

Handles the creation of new posts in an asynchronous manner to support large file uploads and processing.

-   **`POST /create-post`**: The endpoint to initiate post creation. It's protected and requires `SKC` or `SKO` roles. It accepts a title, description, and file attachments.
    1.  Creates a job record in the `PostUploadJobs` table.
    2.  Saves uploaded files to a temporary local directory.
    3.  Responds immediately to the client with a `jobId`.
    4.  Triggers the `processPostUploadJob` function to run in the background.
-   **`GET /post-status/:jobId`**: Allows the client to poll for the status of the post creation job.
-   **`processPostUploadJob(...)`**: The background worker function. It retrieves the job details, creates the post record in the `posts` table, processes and uploads attachments to Azure Blob Storage (compressing videos if necessary), and updates the job status to 'completed' or 'failed'.

#### `postJob.js`

Provides helper functions for managing post creation jobs in the `PostUploadJobs` table.

-   **`createJob(details)`**: Creates a new job record for a post upload.
-   **`getJob(jobId)`**: Retrieves a job by its ID.
-   **`updateJob(jobId, status, message, data)`**: Updates the status and details of a job.
-   **`cleanupJobs()`**: A periodic function to clean up old, completed jobs from the database.

#### `postPublic.js`

Handles the public retrieval of posts and their associated attachments.

-   **`GET /barangays`**: Fetches a list of all barangay names to be used for filtering posts.
-   **`GET /`**: Fetches all posts, with an option to filter by `barangay`. It joins `posts`, `userInfo`, `barangays`, and `postAttachments` tables. For each attachment, it generates a temporary SAS URL for secure access.

---

### `projectReview`

Contains endpoints for administrators to review and manage project submissions.

#### `projectReview.js`

-   **`GET /all`**: Fetches all projects submitted within the admin's assigned barangay for review. It decrypts sensitive project data before responding.
-   **`GET /:id`**: Fetches the details of a single project by its ID.
-   **`PUT /status/:id`**: Updates the status of a project (e.g., 'approved', 'denied', 'revised'). It requires a `status` and `remarks`. It encrypts the remarks and reviewer's name before saving, sends a status update email to the proposer, and logs the action in the audit trail.

---

### `Projects`

This directory contains logic related to project status lookups.

#### `pStatusList.js`

-   **`GET /statuses`**: Fetches the complete list of possible project statuses and their descriptions from the `StatusLookup` table. This is used to populate dropdowns or legends on the frontend.

---

### `projectSubmission`

Handles the submission and retrieval of projects by users.

#### `projectSubmission.js`

-   **`POST /submit`**: The endpoint for users to submit a new project proposal. It accepts a title, description, and a file attachment. It encrypts the title and description, generates a unique reference number, uploads the file to Azure Blob Storage, and saves the project record to the database with a default status of 'Pending Review'.
-   **`GET /user/:userId`**: Fetches all projects submitted by a specific user. It decrypts project details before sending them to the client.
-   **`GET /download/:filename`**: Generates a temporary SAS URL to allow an authorized user (the project owner or an admin) to download a project's attachment.

---

### `pyBridge`

This directory acts as a bridge between the Node.js application and the Python AI scripts.

#### `pyBridgeFC.js`

A bridge for the forecasting (`forecast.py`) scripts.

-   **`runForecast(options)`**: Spawns a Python process to run `forecast.py` to get chart data.
-   **`runForecastWithAnalysis(options)`**: Spawns `forecast.py` with the `--analysis` flag to get a full AI-generated report.
-   **`handleForecastAnalysisRequest(req, res)`**: An Express handler that calls `runForecastWithAnalysis` and sends the result as a JSON response.

#### `pyBridgePA.js`

A bridge for the predictive analysis (`pa.py`, `paTrends.py`, `paCstm.py`, `paCstmTrends.py`) scripts.

-   **`handleProjectTrendsRequest(req, res)`**: Handles requests for general project trends by calling `runProjectTrends`.
-   **`runCustomProjectTrends(options)`**: Spawns `paCstmTrends.py` to generate trend ideas for a specific category.
-   **`handleCustomProjectTrendsRequest(req, res)`**: The Express handler for custom trend requests. It includes validation for category names and profanity filtering.
-   **`runPredictiveAnalysis(options)`**: Spawns `pa.py` to get a full predictive analysis report.
-   **`handlePredictiveAnalysisRequest(req, res)`**: The Express handler for the main predictive analysis feature.
-   **`runCustomizedAnalysis(data, options)`**: Spawns `paCstm.py` to get a customized predictive analysis report based on user-selected sections.
-   **`handleCustomizedAnalysisRequest(req, res)`**: The Express handler for customized analysis.

---

### `rawdata`

Handles the upload and retrieval of raw project data, typically from CSV files.

#### `rawData.js`

-   **`GET /options`**: Fetches distinct committee and category names from the database to populate filter dropdowns.
-   **`GET /`**: Fetches the raw project data, executing the `[Raw Data]` stored procedure which pivots the data to show budgets and targets for each year in separate columns.
-   **`POST /upload`**: Handles the upload of a CSV file. It parses the file, extracts years from the headers, and then iterates through each row. For each row, it finds or creates a record in `rawDataDetails` and then inserts or updates the corresponding yearly data in the `rawData` table. It records the upload event in the `rawDataTrack` table.
-   **`GET /download`**: Allows downloading the current raw data view as a CSV or Excel file.
-   **`GET /tracking`**: Fethes the history of all CSV uploads from the `rawDataTrack` table.

---

### `routeGuard`

Contains middleware for protecting routes and checking permissions.

#### `permission.js`

-   **`checkRole(allowedRoles)`**: A middleware function that checks if the authenticated user's role (from the JWT `position` claim) is included in the `allowedRoles` array. If not, it denies access.

#### `routeGuard.js`

-   **`verifyToken(req, res, next)`**: A middleware that verifies the JWT token from the `Authorization` header. If the token is valid, it decodes the user information and attaches it to the `req.user` object.
-   **`isAdmin(req, res, next)`**: A middleware that checks if the authenticated user has admin privileges (`MA` or `SA`). It first checks the token and then falls back to a database query if needed.

---

### `session`

Manages user sessions and authentication state.

#### `session.js`

-   **`createSession(userID)`**: Creates a new session for a user. It expires any previous sessions for that user and inserts a new session record into the `sessions` table with a unique session ID.
-   **`authMiddleware(req, res, next)`**: The core authentication middleware. It validates the JWT from the request, verifies the session is active in the database, and refreshes the session's `lastSeen` time. It decrypts user info and attaches it to `req.user`.
-   **`logout(req, res)`**: Expires the user's current session in the database and removes it from the in-memory store.
-   **`validateToken(req, res)`**: An endpoint handler that simply confirms if the token provided in the request is valid (relies on `authMiddleware` to have run first).

---

### `Storage`

Handles interactions with the Azure Blob Storage service.

#### `storage.js`

-   Configures the Azure Blob Storage client using connection strings and keys from environment variables. It includes a fallback mechanism to use a secondary connection string if the primary one is not available.
-   **`uploadFile(file)`**: Uploads a file (from a buffer) to the appropriate container (images, videos, or docs) based on its MIME type. It returns the unique blob name.
-   **`getFileSasUrl(blobName, fileType)`**: Generates a temporary, read-only SAS URL for a given blob, allowing for secure, short-term access to the file.
-   **`uploadBackupFile(filePath, blobName)`**: Uploads a local file (e.g., a `.bacpac` file) to the designated backup container.
-   **`listBackups()`**: Lists all blobs in the backup container, sorted by creation date.
-   **`downloadBackupFile(blobName, downloadPath)`**: Downloads a blob from the backup container to a specified local file path.

---

### `utils`

Contains utility functions used across the application.

#### `crypto.js`

-   Provides functions for symmetric encryption and decryption using `AES-256-GCM`. The encryption key is loaded from the `AES_256_KEY` environment variable.
-   **`encrypt(text)`**: Encrypts a string and returns a Base64 encoded result containing the IV, ciphertext, and authentication tag.
-   **`decrypt(encryptedText)`**: Decrypts the Base64 string and returns the original plaintext. It handles errors gracefully, returning `null` if decryption fails (e.g., due to tampered data).
-   **`generateEmailHash(email)`**: Creates a `SHA-256` hash of a normalized email address for secure, blind lookups.
-   **`generateUsernameHash(username)`**: Creates a `SHA-256` hash of a normalized username.

---

### `websockets`

Manages real-time communication with clients using WebSockets.

#### `websocket.js`

-   **`initializeWebSocketServer(server)`**: Initializes the WebSocket server, attaching it to the main HTTP server. It handles new connections, disconnections, and errors. It also includes logic to notify newly connected clients if the server has just restarted after a maintenance period.
-   **`broadcast(message)`**: A function that sends a JSON message to all currently connected WebSocket clients. This is used to notify all users of events like the start and end of maintenance mode.