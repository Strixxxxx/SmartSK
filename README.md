# SmartSK Project

## Project Overview

SmartSK is a web application designed to assist Sangguniang Kabataan (SK) councils in managing their projects, budgets, and data analysis. It provides a platform for project submission, review, and monitoring, along with AI-powered forecasting and predictive analysis to aid in decision-making. The application features distinct roles for administrators and regular users, each with a tailored dashboard and functionalities.

## Tech Stack

### Backend (Node.js)

-   **Express.js**: A web application framework for building the RESTful APIs.
-   **mssql**: Microsoft SQL Server client for Node.js.
-   **jsonwebtoken (JWT)**: For user authentication.
-   **bcrypt**: For hashing passwords.
-   **nodemailer**: For sending emails (account creation, password recovery, etc.).
-   **multer**: Middleware for handling file uploads.
-   **cors**: For enabling Cross-Origin Resource Sharing.
-   **dotenv**: For managing environment variables.
-   **ws**: For real-time communication via WebSockets.
-   **node-cron**: For scheduling background jobs (AI tasks, database backups).
-   **archiver**: For creating compressed backup files.
-   **sharp**: For image processing (watermarking).
-   **fluent-ffmpeg**: For video compression.

### Frontend (React)

-   **React & TypeScript**: A library for building user interfaces with type safety.
-   **Vite**: A fast build tool and development server.
-   **React Router**: For handling client-side routing.
-   **Axios**: A promise-based HTTP client for making API requests.
-   **Material-UI (MUI)**: A React UI framework for building the user interface.
-   **Chart.js** & **react-chartjs-2**: For creating charts and graphs.
-   **react-toastify**: For displaying toast notifications.
-   **react-hook-form**: For managing complex forms.
-   **Day.js**: A lightweight library for date and time manipulation.

### AI (Python)

-   **TensorFlow & scikit-learn**: For machine learning models, including LSTM for forecasting.
-   **Pandas & NumPy**: For data manipulation and analysis.
-   **Google Generative AI (Gemini)**: For generating textual analysis, reports, and handling AI-driven verification.
-   **pycryptodome**: For performing encryption and decryption in Python scripts.
-   **pypdf & python-docx**: For extracting text from uploaded PDF and DOCX files.
-   **Azure Storage Blob**: For interacting with file storage from Python scripts.

### Database

-   **Microsoft SQL Server**: The relational database management system.

## Backend Functionalities

### `main.js`

The entry point of the backend application. It initializes the Express server, sets up middleware, defines all API routes, and configures scheduled jobs using `node-cron` for hourly AI analysis and monthly database backups.

### `Admin/`

-   **`accountCreation.js`**: Handles the creation of new user accounts by administrators.
-   **`backup.js` & `backupJob.js`**: Manage the asynchronous creation and restoration of database backups, tracking job status in the database.
-   **`archive.js`, `accArchive.js`, `projArchive.js`**: Provide routes for archiving and restoring user accounts and projects.
-   **`roles.js`**: Defines and manages user roles and permissions.
-   **`sessionlog.js`**: Logs user session activities.
-   **`projList.js`**: Fetches a list of all non-archived projects for the admin's barangay.
-   **`registerAudit.js`**: Manages the list of official SK members (for AI verification) and provides endpoints to view registration audit logs.

### `AI/`

-   **`aiJobs.py`**: A master script that orchestrates the hourly generation of all AI reports (forecasting, trends, and predictive analysis). It fetches data, reshapes it, and runs the various logic modules.
-   **`accountAIJobs.py`**: An AI-driven script for verifying new user registrations by analyzing uploaded IDs for format, data consistency (name, DOB), and cross-referencing against the official SK members list.
-   **`projectAIJobs.py`**: An AI-driven script that reviews submitted project proposals against a set of predefined rules for compliance.
-   **`forecast.py`**: Generates budget forecast charts using an LSTM model and textual analysis using Google Gemini.
-   **`pa_logic.py` & `trends_logic.py`**: Contain the core logic for generating predictive analysis reports and project trend suggestions.
-   **`crypto.py`**: A Python port of the Node.js crypto utility for decrypting data within the AI environment.

### `AIDataRetrieval/`

-   **`reports.js`**: Exposes API endpoints (`/api/reports/...`) for the frontend to fetch the pre-generated JSON reports created by the hourly AI jobs.

### `audit/`

-   **`auditService.js`**: Provides a centralized service for logging and retrieving audit trail data.

### `Posting/`

-   **`post.js` & `postJob.js`**: Handle the asynchronous, job-based creation of new posts, including file uploads and processing.
-   **`managePost.js`**: Provides authenticated users with endpoints to edit, archive, restore, and delete their own posts.
-   **`postPublic.js`**: Exposes public-facing API endpoints for viewing posts, as well as the main feed for authenticated users.
-   **`comment.js` & `commentProtected.js`**: Manage the creation and editing of comments on posts.
-   **`taggedProjects.js`**: Routes for fetching projects that a user can tag in a post.

### `projectSubmission/` & `projectReview/`

-   **`projectSubmission.js`**: Manages the submission of new projects, including file uploads and triggering the AI analysis job.
-   **`projectReview.js`**: Allows authorized users (like the SK Chairperson) to manually review and update the status of submitted projects.

### `session/` & `routeGuard/`

-   **`session.js`**: Manages user sessions, including creation, logout, and token validation via middleware.
-   **`permission.js`**: Provides role-based access control middleware to protect routes.

### `Storage/` & `utils/`

-   **`storage.js`**: A centralized module for interacting with Azure Blob Storage, handling uploads, downloads, SAS URL generation, and deletion across different containers.
-   **`utils/`**: Contains utility functions for cryptography (`crypto.js`) and time management (`time.js`).

## Frontend Functionalities

### `src/`

The main source directory for the React application.

-   **`App.tsx`**: The root component that sets up routing, authentication context, and WebSocket providers. It also includes the high-level `MaintenanceHandler`.
-   **`AppRoutes.tsx`**: Defines all client-side routes, using `AdminGuard` to protect admin-only sections and conditionally rendering layouts based on user roles.
-   **`main.tsx`**: The entry point of the React application.

### `components/`

Contains all React components, organized by feature domains.

-   **`Admin/`**: Components for the administrator dashboard, including account management, project review, raw data upload, audit trail viewer, session logs, and the database backup/restore interface.
-   **`Client/`**: Components for the standard user dashboard, including the main post feed (`Dashboard`), project submission forms (`Projects`), and the AI-powered `Forecast` and `PredictiveAnalysis` pages.
-   **`Portfolio/`**: The public-facing landing page and project list.
-   **`Login/` & `Registration/`**: User-facing forms for authentication and multi-step new user registration.
-   **`RouteGuard/`**: Contains the `AdminGuard` component to protect admin routes based on the user's role.

### `context/`

-   **`AuthContext.tsx`**: A React context that provides global authentication state (user, loading status) and functions (`login`, `logout`) to the entire application.
-   **`WebSocketContext.tsx`**: Manages the WebSocket connection to the backend, listening for and broadcasting real-time messages like maintenance alerts and post updates.

### `backend connection/`

-   **`axiosConfig.ts`**: Configures the global Axios instance with interceptors to automatically add authentication tokens to requests and handle global errors (like 401 Unauthorized).
-   **`auth.ts`**: Provides a clean interface for authentication-related API calls, managing user data caching and session state.

## Getting Started

### Prerequisites

-   Node.js and npm
-   Python and pip
-   Microsoft SQL Server

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    ```
2.  **Install backend dependencies:**
    ```bash
    cd backend
    npm install
    ```
3.  **Install frontend dependencies:**
    ```bash
    cd frontend
    npm install
    ```
4.  **Set up environment variables:**
    *   Create a `.env` file in the `backend` directory and add the necessary environment variables (e.g., database credentials, JWT secret, storage keys, and Gemini API Key).

### Running the application

1.  **Start the backend server:**
    ```bash
    cd backend
    npm start
    ```
2.  **Start the frontend development server:**
    ```bash
    cd frontend
    npm run dev
    ```

## Key Features

-   **Secure Authentication**: Robust login and registration system with JWT, password hashing, and secure session management.
-   **AI-Powered Registration**: New user sign-ups are verified by an AI that analyzes the submitted ID for authenticity and data consistency.
-   **Role-Based Access Control**: Separate, tailored dashboards and functionalities for Administrators (MA, SA), SK Chairpersons (SKC), and regular SK Officials (SKO).
-   **Asynchronous Job Processing**: Post creation and database backups are handled as background jobs to prevent UI blocking and improve user experience.
-   **Project Management**: A full lifecycle for projects, from AI-assisted proposal submission and review to status tracking.
-   **AI-Powered Analytics**:
    -   **Forecasting**: Provides budget forecasts using LSTM models based on historical data.
    -   **Predictive Analysis**: Offers insights, trends, and recommendations generated by Google's Gemini AI.
-   **Real-time Notifications**: WebSockets provide real-time updates for system maintenance events.
-   **Comprehensive Auditing**: A detailed audit trail logs all significant user and system actions for security and accountability.
-   **Secure Database Management**: Features secure, encrypted database backup and restore functionality, including an automated monthly backup job.
