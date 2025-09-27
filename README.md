# SmartSK Project

## Project Overview

SmartSK is a web application designed to assist Sangguniang Kabataan (SK) councils in managing their projects, budgets, and data analysis. It provides a platform for project submission, review, and monitoring, along with AI-powered forecasting and predictive analysis to aid in decision-making. The application features distinct roles for administrators and regular users, each with a tailored dashboard and functionalities.

## Tech Stack

### Backend

-   **Node.js**: A JavaScript runtime environment for the server-side.
-   **Express.js**: A web application framework for Node.js, used to build the RESTful APIs.
-   **mssql**: A Microsoft SQL Server client for Node.js.
-   **jsonwebtoken (JWT)**: For generating and verifying JSON Web Tokens for authentication.
-   **bcrypt**: A library for hashing passwords.
-   **nodemailer**: For sending emails (e.g., for account creation and password recovery).
-   **multer**: A middleware for handling `multipart/form-data`, used for file uploads.
-   **pdf-parse**: A library for parsing PDF files.
-   **dotenv**: For managing environment variables.
-   **cors**: For enabling Cross-Origin Resource Sharing.

### Frontend

-   **React**: A JavaScript library for building user interfaces.
-   **TypeScript**: A typed superset of JavaScript that compiles to plain JavaScript.
-   **Vite**: A fast build tool and development server for modern web projects.
-   **React Router**: For handling routing in the application.
-   **Axios**: A promise-based HTTP client for making requests to the backend.
-   **Material-UI (MUI)**: A popular React UI framework for faster and easier web development.
-   **Chart.js** & **react-chartjs-2**: For creating charts and graphs.
-   **react-toastify**: For displaying notifications.
-   **Day.js**: A minimalist JavaScript library for parsing, validating, manipulating, and displaying dates and times.
-   **Emotion**: A library for writing CSS styles with JavaScript.

### Database

-   **Microsoft SQL Server**: The relational database management system used to store the application's data.

### AI

-   **Python**: Used for the AI and data analysis scripts.
-   **Pandas**: A data manipulation and analysis library for Python.
-   **pyodbc**: For connecting to the SQL Server database from Python.
-   **Google Generative AI (Gemini)**: Used for generating textual analysis and reports.
-   **Google API Python Client**: For interacting with Google APIs, including the Programmable Search Engine for web trend analysis.
-   **requests**: For making HTTP requests from Python.

## Backend Functionalities

### `main.js`

The entry point of the backend application. It initializes the Express server, sets up middleware (CORS, JSON parsing, etc.), and defines the API routes. It also includes a bridge to the Python scripts for AI-powered features.

### `Admin/`

-   **`accountCreation.js`**: Handles the creation of new user accounts by administrators.
-   **`backup.js`**: Manages the creation and restoration of database backups.
-   **`roles.js`**: Defines and manages user roles and permissions.
-   **`sessionlog.js`**: Logs user session activities.

### `AI/`

Contains the Python scripts for the AI and data analysis features.

-   **`forecast.py`**: Generates budget forecast charts based on historical data and provides a high-level analysis of the data using Google Gemini.
-   **`pa.py`**: Performs general predictive analysis using historical data and real-time web search results from the Google Programmable Search Engine API.
-   **`paCstm.py`**: Generates customized predictive analysis reports based on user-selected components (e.g., budget, risks, trends).
-   **`paTrends.py`**: Identifies general project trends by combining historical data with web search results.
-   **`paCstmTrends.py`**: Identifies project trends for a specific category or year, also using historical data and web searches.

### `audit/`

-   **`auditService.js`**: Provides services for logging and retrieving audit trail data.

### `config/`

-   **`jwt.js`**: Contains the configuration for JWT, such as the secret key.

### `database/`

-   **`database.js`**: Manages the connection to the Microsoft SQL Server database.

### `Email/`

-   **`email.js`**: Handles the sending of emails for various purposes, such as account creation and password resets.

### `forgotpassword/`

-   **`forgotPassword.js`**: Implements the logic for the "forgot password" feature, including sending reset links and updating passwords.

### `login/`

-   **`login.js`**: Handles user authentication and generates a JWT upon successful login.

### `projectlSubmission/`

-   **`projectSubmission.js`**: Manages the submission of new projects by users.

### `projectReview/`

-   **`projectReview.js`**: Handles the review and approval process for submitted projects.

### `pyBridge/`

-   **`pyBridgeFC.js`**: Acts as a bridge between the Node.js backend and the Python forecasting scripts (`forecast.py`).
-   **`pyBridgePA.js`**: Acts as a bridge for predictive analysis and trends scripts (`pa.py`, `paCstm.py`, `paTrends.py`, `paCstmTrends.py`).

### `rawdata/`

-   **`rawData.js`**: Manages the handling and uploading of raw CSV data for AI analysis.

### `routeGuard/`

-   **`routeGuard.js`**: A middleware to protect routes that require authentication and authorization.

### `session/`

-   **`session.js`**: Manages user sessions, including login, logout, and token validation.

## Frontend Functionalities

### `src/`

The main source code directory for the frontend application.

-   **`App.tsx`**: The main component of the application. It sets up the router and the authentication provider.
-   **`AppRoutes.tsx`**: Defines all the routes for the application, including public routes, client routes, and admin routes.
-   **`main.tsx`**: The entry point of the React application.

### `components/`

Contains all the React components used in the application, organized by feature.

-   **`Admin/`**: Components for the admin dashboard, including account creation, roles management, audit trail, session logs, and database backup.
-   **`Client/`**: Components for the client dashboard, including project forecasting and predictive analysis.
-   **`Login/`**: The login component and new account setup.
-   **`Projects/`**: Components for submitting and reviewing projects.
-   **`RouteGuard/`**: Components for protecting routes based on user roles.

### `backend connection/`

-   **`axiosConfig.ts`**: Configures the Axios instance for making HTTP requests to the backend, including interceptors for adding authentication tokens and handling errors.
-   **`auth.ts`**: Contains functions for handling authentication-related API calls.
-   **`config.ts`**: Contains configuration for the backend connection, such as the base URL.

### `context/`

-   **`AuthContext.tsx`**: Provides an authentication context to the application, allowing components to access the current user's authentication state.

### `assets/`

Contains static assets such as images and logos.

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
    cd ../frontend
    npm install
    ```
4.  **Set up environment variables:**
    *   Create a `.env` file in the `backend` directory and add the necessary environment variables (e.g., database credentials, JWT secret, Gemini API Key, Google PSE API Key and CX ID).

### Running the application

1.  **Start the backend server:**
    ```bash
    cd backend
    node main.js
    ```
2.  **Start the frontend development server:**
    ```bash
    cd ../frontend
    npm run dev
    ```

## Key Features

-   **User Authentication**: Secure login and registration system with JWT.
-   **Role-Based Access Control**: Different dashboards and functionalities for administrators and regular users.
-   **Project Management**: Users can submit, review, and manage projects.
-   **AI-Powered Forecasting**: Provides budget forecasts based on historical data.
-   **Predictive Analysis**: Offers insights and predictions to aid in decision-making, enhanced with real-time web search data.
-   **Audit Trail**: Logs user activities for security and accountability.
-   **Database Backup**: Allows administrators to create backups of the database.