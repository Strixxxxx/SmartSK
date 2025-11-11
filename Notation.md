# smartSK System Notations

This document outlines the various notations, conventions, and code standards used throughout the smartSK system.

## 1. Database Schema

The database uses MSSQL. Key tables and their naming conventions are as follows. Columns intended for sensitive user data are of type `NVARCHAR(MAX)` to store AES-256-GCM encrypted strings.

### Key Tables

-   **`userInfo`**: Stores primary information for authenticated users.
    -   `userID` (PK, INT, IDENTITY): Unique user identifier.
    -   `username`, `fullName`, `emailAddress`, `phoneNumber` (NVARCHAR(MAX)): Encrypted user data.
    -   `passKey` (NVARCHAR(255)): Stores bcrypt-hashed passwords.
    -   `position` (FK, INT): References `roles.roleID`.
    -   `barangay` (FK, INT): References `barangays.barangayID`.
    -   `isArchived` (BIT): Flag (0 or 1) to mark an account as inactive.
    -   `emailHash`, `usernameHash` (VARCHAR(64)): SHA-256 hashes for blind lookups to check for existence without decrypting data.

-   **`preUserInfo` / `preUserInfoEx`**: Staging tables for user registration before AI verification and approval.

-   **`projects`**: Contains all project proposals.
    -   `projectID` (PK, INT, IDENTITY): Unique project identifier.
    -   `reference_number` (VARCHAR(255)): A unique, human-readable ID for the project.
    -   `title`, `description`, `remarks`, `reviewedBy` (NVARCHAR(MAX)): Encrypted text fields.
    -   `status` (FK, INT): References `StatusLookup.StatusID`.

-   **`posts`**: Stores portfolio posts created by users.
    -   `postID` (PK, INT, IDENTITY): Unique post identifier.
    -   `postReference` (NVARCHAR(16)): A unique, time-based reference ID (e.g., `G-20251111123000`).

-   **`audit trail`**: Logs system and user actions.
    -   `auditID` (PK, NVARCHAR(16)): A unique ID generated based on timestamp and actor/module codes (e.g., `110925143000AC`).
    -   `moduleName` (NVARCHAR(128)): The full name of the module where the action occurred.
    -   `actions` (NVARCHAR(50)): A kebab-case description of the action (e.g., `create-post-async`).

-   **`BackupJobs` / `PostUploadJobs`**: Tables to track the status of asynchronous background jobs.
    -   `JobID` (PK, NVARCHAR(50)): A UUID for the job.
    -   `Status` (NVARCHAR(20)): The current state of the job (e.g., `pending`, `processing`, `completed`, `failed`).

### Stored Procedures

-   **`[Raw Data]`**: Fetches and pivots historical project data for analysis.
-   **`[sp_ApprovePendingUser]`**: Migrates a user from `preUserInfo` to the main `userInfo` table upon successful registration approval.
-   **`[DeletePostAndRelatedData]`**: Deletes a post and all its associated data (comments, attachments, etc.) in a single transaction.

## 2. API Route Conventions

The backend exposes a RESTful API under the `/api` prefix. Routes are organized by functionality.

-   **Authentication**: `/api/login`, `/api/logout`, `/api/register`
-   **Password Reset**: `/api/forgotpassword/request`, `/api/forgotpassword/verify-otp`, `/api/forgotpassword/reset`
-   **Admin**: `/api/admin/...`
    -   `/api/admin/user-list`: User account management.
    -   `/api/admin/backup`: Database backup and restore.
    -   `/api/admin/archive/accounts`: Account archival.
    -   `/api/admin/audit/registrations`: Registration verification logs.
-   **Projects**: `/api/projects/...`
    -   `/api/projects/submit`: Submit a new project.
    -   `/api/projects/user/{userId}`: Get projects for a specific user.
-   **Portfolio/Posts**: `/api/posts/...`, `/api/manage-post/...`
    -   `/api/posts/feed`: Get posts for the authenticated user's feed.
    -   `/api/posts/{postId}/comments`: Get/add comments for a post.
    -   `/api/manage-post/edit/{postId}`: Edit a post.
-   **AI Data Retrieval**: `/api/reports/...`
    -   `/api/reports/forecast`: Get the pre-generated budget forecast report.
    -   `/api/reports/pa-analysis`: Get the predictive analysis report.

## 3. Audit Trail Codes

Audit logs use single-character codes for `actor` and `module` to create a compact `auditID`.

### Actor Codes

-   **A**: Admin (MA, SA)
-   **C**: Client (SKC, SKO)
-   **S**: System (Automated processes like schedulers or AI jobs)
-   **U**: Unauthenticated User (e.g., during registration)

### Module Codes

-   **A**: Authentication
-   **B**: Backup
-   **C**: Account Creation
-   **D**: Archive
-   **E**: Email
-   **F**: Forgot Password
-   **G**: Posting (Portfolio)
-   **I**: Registration
-   **L**: Login
-   **P**: Projects
-   **Q**: Portfolio (Legacy)
-   **R**: Roles
-   **S**: Session log
-   **X**: Predictive Analysis
-   **Y**: Forecast
-   **Z**: Raw Data

## 4. File Naming & Storage Conventions

Files are stored in Azure Blob Storage in dedicated containers.

-   **Registration IDs**: `FOR VERIFICATION ONLY` watermark is applied. Stored in the `register` container.
    -   Filename: `{timestamp}-{username}-{originalname}`
-   **Database Backups**: Stored in the `backup` container.
    -   Filename: `smartSK_{YYYY-MM-DD}_{HH-MM-SS}.bacpac`
-   **SK Officials Lists**: Plain text files stored in the `register` container.
    -   Filename: `SK OFFICIAL - {BarangayName}.txt`
-   **General Attachments**: Stored in `images`, `videos`, or `documents` containers.
    -   Filename: `{timestamp}-{uuid}{extension}`

## 5. Environment Variables

The system relies on a `.env` file for configuration.

-   **Database**: `DB_SERVER`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_DRIVER`, `DB_PORT`
-   **Security**: `JWT_SECRET_KEY`, `AES_256_KEY`
-   **Azure Storage**: `STORAGE_NAME`, `STORAGE_CONNECTION_STRING_1`, `STORAGE_KEY_1`, and container names (`IMAGE_CONTAINER`, `BACKUP_CONTAINER`, etc.)
-   **Email**: `EMAIL_USER`, `EMAIL_PASS`
-   **Backup**: `ZIP_LOCK` (Password for encrypted local backup zip files)
-   **AI**: `GEMINI_API_KEY`
-   **Frontend**: `VITE_BACKEND_SERVER` (URL of the backend API)

## 6. Frontend URL Routes

The React frontend uses `react-router-dom` for navigation.

-   **Public**: `/home`, `/project-list`, `/register`, `/forgot-password`
-   **Client (SKO, SKC)**: `/dashboard`, `/projects`, `/raw-data-list`, `/predictive-analytics`, `/forecast`
-   **Admin (MA, SA)**: All routes under the `/admin/` prefix, such as:
    -   `/admin/dashboard`
    -   `/admin/account-management`
    -   `/admin/audit-trail`
    -   `/admin/backup`

## 7. AI Job Payloads & Responses

The Node.js backend communicates with Python AI scripts via child processes, using structured JSON.

-   **Account Verification (`accountAIJobs.py`)**:
    -   **Input**: `userID` (as a command-line argument).
    -   **Output**: The script updates the database directly and generates a `verificationReport` in the `registrationAudit` table. It uses the Gemini API to analyze ID images and expects JSON responses like `{"id_type": "QCID"}` or `{"last_name": "...", "first_name": "...", ...}`.

-   **Data Analysis (`aiJobs.py`)**:
    -   **Input**: Reads historical data from Azure Blob Storage (`ha-container`) or the SQL database.
    -   **Output**: Generates master JSON reports and uploads them to the `json-container` in Azure.
        -   `forecast.json`: Contains `by_committee` and `by_category` sections, each with `chart_data` and AI-generated `analysis` (summary, trends, recommendations).
        -   `pa_analysis.json`: A dictionary where keys are analysis targets (e.g., `general`, `category_health`) and values are detailed reports with sections like `summary_report`, `success_factors`, `risk_mitigation_strategies`, etc.
        -   `pa_trends.json`: A dictionary where keys are categories (e.g., `General`, `Health`) and values are lists of trend objects, each with `id`, `name`, `description`, `confidence`, `impact`, etc.

## 8. WebSocket Message Types

Real-time communication is handled via WebSockets.

-   `{ "type": "auth", "token": "..." }`: Sent by the client to authenticate its WebSocket connection.
-   `{ "type": "maintenance_starting" }`: Broadcast by the server when a database restore begins.
-   `{ "type": "maintenance_ended" }`: Broadcast by the server when maintenance is complete.
-   `{ "type": "job-update", "status": "...", "message": "..." }`: Sent to a specific user to update on the status of a background job (e.g., post creation).
-   `{ "type": "POSTS_UPDATED" }`: Broadcast to all clients to signal that the post feed should be refreshed.

## 9. CSS Class Naming Convention

The frontend follows a descriptive, component-based naming convention.

-   **Structure**: `.{component-name}-{element-name}` (e.g., `.admin-sidebar-header`, `.post-card`).
-   **State Modifiers**: A suffix is used to denote a state (e.g., `.sidebar-collapsed`, `.filter-btn.active`).
-   **Utility-like**: Some classes describe their function (e.g., `.loading`, `.error-message`).
-   **Component Scoping**: Styles are generally scoped to their respective components to avoid global conflicts.

## 10. Package Dependencies

This section lists the npm packages used in the project.

### 10.1. Backend (Node.js)

| Package                  | Version    | Description                                                                                              |
| :----------------------- | :--------- | :------------------------------------------------------------------------------------------------------- |
| `@azure/arm-sql`         | `^10.0.0`  | Azure SDK for managing SQL resources via Azure Resource Manager (ARM).                                   |
| `@azure/identity`        | `^4.12.0`  | Provides Azure Active Directory token authentication for Azure SDK.                                      |
| `@azure/storage-blob`    | `^12.28.0` | Azure Blob Storage client library for Node.js.                                                           |
| `archiver`               | `^7.0.1`   | A library for creating archive files (e.g., .zip).                                                       |
| `archiver-zip-encrypted` | `^2.0.0`   | An extension for `archiver` to create password-protected zip files.                                      |
| `axios`                  | `^1.11.0`  | Promise-based HTTP client for making requests to external resources.                                     |
| `bcrypt`                 | `^6.0.0`   | A library for hashing passwords securely.                                                                |
| `cors`                   | `^2.8.5`   | Express middleware to enable Cross-Origin Resource Sharing (CORS).                                       |
| `csv-parser`             | `^3.2.0`   | A streaming CSV parser for Node.js.                                                                      |
| `dotenv`                 | `^16.4.5`  | Loads environment variables from a `.env` file into `process.env`.                                       |
| `express`                | `^5.1.0`   | A minimalist web framework for building the backend API.                                                 |
| `fluent-ffmpeg`          | `^2.1.3`   | A fluent API for FFmpeg, used for multimedia processing (e.g., video watermarking).                      |
| `jsonwebtoken`           | `^9.0.2`   | An implementation of JSON Web Tokens (JWT) for user authentication.                                      |
| `mssql`                  | `^11.0.1`  | Microsoft SQL Server client for Node.js, used for all database interactions.                             |
| `multer`                 | `^2.0.1`   | Middleware for handling `multipart/form-data`, primarily for file uploads.                               |
| `node-cron`              | `^4.2.1`   | A simple cron-like job scheduler for running tasks at scheduled intervals.                               |
| `nodemailer`             | `^7.0.3`   | A module for sending emails (e.g., for password resets).                                                 |
| `pdf-parse`              | `^1.1.1`   | A library to read text content from PDF files.                                                           |
| `sharp`                  | `^0.34.5`  | High-performance image processing library for tasks like resizing or watermarking images.                |
| `uuid4`                  | `^2.0.3`   | Generates universally unique identifiers (UUIDs), used for creating unique job IDs.                      |
| `ws`                     | `^8.17.0`  | A high-performance WebSocket client and server library for real-time communication.                      |

### 10.2. Frontend (React + Vite)

#### Dependencies

| Package                    | Version     | Description                                                                                              |
| :------------------------- | :---------- | :------------------------------------------------------------------------------------------------------- |
| `@emotion/react`           | `^11.14.0`  | A library for writing CSS styles with JavaScript, used by Material-UI.                                   |
| `@emotion/styled`          | `^11.14.0`  | A way to create styled components with `@emotion`.                                                       |
| `@mui/icons-material`      | `^7.0.2`    | Provides Material-UI (MUI) SVG icons as React components.                                                |
| `@mui/material`            | `^7.0.2`    | The core Material-UI (MUI) component library for building the user interface.                            |
| `@mui/x-date-pickers`      | `^7.28.3`   | Advanced date and time picker components for MUI.                                                        |
| `axios`                    | `^1.9.0`    | Promise-based HTTP client for communicating with the backend API.                                        |
| `bootstrap-icons`          | `^1.11.3`   | The Bootstrap framework's icon library.                                                                  |
| `chart.js`                 | `^4.5.0`    | A flexible JavaScript library for creating charts and graphs.                                            |
| `chartjs-plugin-datalabels`| `^2.2.0`    | A plugin for Chart.js to display labels directly on the data points of a chart.                          |
| `dayjs`                    | `^1.11.13`  | A lightweight library for parsing, manipulating, and formatting dates.                                   |
| `react`                    | `^19.1.1`   | The core library for building user interfaces with components.                                           |
| `react-bootstrap`          | `^2.10.9`   | Bootstrap components rebuilt for React.                                                                  |
| `react-bootstrap-icons`    | `^1.11.6`   | Bootstrap icons as React components.                                                                     |
| `react-chartjs-2`          | `^5.3.0`    | React components that wrap Chart.js, simplifying chart integration.                                      |
| `react-dom`                | `^19.1.1`   | Provides the methods to render React components into the browser's DOM.                                  |
| `react-hook-form`          | `^7.63.0`   | A library for building performant and flexible forms with easy validation.                               |
| `react-icons`              | `^5.5.0`    | A library that includes many popular icon sets as React components.                                      |
| `react-markdown`           | `^10.1.0`   | A React component to safely render Markdown content.                                                     |
| `react-router-dom`         | `^6.30.0`   | Handles client-side routing, enabling navigation between different pages in the single-page application. |
| `react-toastify`           | `^11.0.5`   | A library for adding "toast" notifications to the app.                                                   |

#### DevDependencies

| Package                       | Version     | Description                                                                                              |
| :---------------------------- | :---------- | :------------------------------------------------------------------------------------------------------- |
| `@eslint/js`                  | `^9.33.0`   | Core rules for ESLint.                                                                                   |
| `@types/node`                 | `^24.9.2`   | TypeScript type definitions for Node.js.                                                                 |
| `@types/react`                | `^19.1.10`  | TypeScript type definitions for React.                                                                   |
| `@types/react-dom`            | `^19.1.7`   | TypeScript type definitions for `react-dom`.                                                             |
| `@vitejs/plugin-react`        | `^5.0.0`    | The official Vite plugin for React, enabling features like Fast Refresh.                                 |
| `eslint`                      | `^9.33.0`   | A pluggable linter tool for identifying and reporting on patterns in JavaScript code to ensure quality.  |
| `eslint-plugin-react-hooks`   | `^5.2.0`    | ESLint rules for React Hooks.                                                                            |
| `eslint-plugin-react-refresh` | `^0.4.20`   | ESLint rules for React Refresh to enforce best practices.                                                |
| `globals`                     | `^16.3.0`   | Global identifiers for ESLint configuration.                                                             |
| `typescript`                  | `~5.8.3`    | A typed superset of JavaScript that compiles to plain JavaScript, used for type safety.                  |
| `typescript-eslint`           | `^8.39.1`   | Tooling that enables ESLint to lint TypeScript source code.                                              |
| `vite`                        | `^7.1.4`    | A modern frontend build tool that provides a fast development server and optimized production builds.    |

### 10.3. Backend (Python)

| Package                  | Version   | Description                                                                                              |
| :----------------------- | :-------- | :------------------------------------------------------------------------------------------------------- |
| `pandas`                 | `N/A`     | A powerful data analysis and manipulation library.                                                       |
| `numpy`                  | `N/A`     | A fundamental package for scientific computing with Python.                                              |
| `pyodbc`                 | `N/A`     | A Python DB API 2 module for ODBC databases, used to connect to MSSQL.                                   |
| `google-generativeai`    | `N/A`     | The official Python library for the Google Gemini API.                                                   |
| `google-api-python-client` | `N/A`     | Google's client library for accessing their APIs.                                                        |
| `better-profanity`       | `N/A`     | A library to filter out profanity and other unwanted text.                                               |
| `requests`               | `N/A`     | A simple, yet elegant, HTTP library for Python.                                                          |
| `python-dotenv`          | `N/A`     | Reads key-value pairs from a `.env` file and sets them as environment variables.                         |
| `azure-storage-blob`     | `N/A`     | The Microsoft Azure Storage Blob client library for Python.                                              |
| `tensorflow`             | `2.16.1`  | An end-to-end open source platform for machine learning.                                                 |
| `scikit-learn`           | `1.5.0`   | A machine learning library for Python with various classification, regression, and clustering algorithms. |
| `python-dateutil`        | `N/A`     | Provides powerful extensions to the standard `datetime` module.                                          |
| `Pillow`                 | `N/A`     | A friendly fork of PIL (Python Imaging Library) for image manipulation.                                  |
| `pycryptodome`           | `N/A`     | A self-contained Python package of low-level cryptographic primitives.                                   |

