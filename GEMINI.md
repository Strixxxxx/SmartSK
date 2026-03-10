# Project smartSK Overview

This document provides a comprehensive overview of the `smartSK` project, including its purpose, architecture, and development conventions, to guide future interactions with the Gemini assistant.

## 1. Project Purpose

`smartSK` is a full-stack web application designed to assist Sangguniang Kabataan (SK) councils in the Philippines. It provides a platform for managing projects, budgets, and data analysis.

The system features role-based access control for administrators and standard users, offering tailored dashboards and functionalities for each. Its core purpose is to streamline project submission, review, and monitoring, while leveraging AI-powered tools for forecasting and predictive analysis to support data-driven decision-making.

## 2. Architecture

The project is a monorepo containing a separate frontend and backend.

-   **Backend (`/backend`):** Split into two specialized services:
    -   **Node.js Backend (`/backend/backend-node`):** Built with Express.js. Serves the RESTful API for user authentication (JWT), data management, and file uploads. It also handles real-time communication via WebSockets.
    -   **Python Backend (`/backend/backend-python`):** A FastAPI-based service (formerly AI/ML scripts) that perform data analysis, forecasting, and predictive modeling using Pandas and Google's Gemini API.
-   **Frontend (`/frontend`):** A modern single-page application (SPA) built with React and TypeScript using Vite. UI is constructed with Material-UI (MUI) and Chart.js. Communicates with the backend-node via Axios.
-   **Database:** Microsoft SQL Server (MSSQL) serves as the relational database.
-   **Storage:** Transitioned from the local filesystem to **Azure Blob Storage** for secure and scalable file management (backups, documents, project batches, etc.).
-   **Deployment:** The backend services are containerized using Docker and deployed on **Azure App Service**, while the frontend is hosted on **Netlify**. A CI/CD pipeline is maintained with GitHub Actions.

## 3. Key Technologies

| Category      | Technology                                                              |
| :------------ | :---------------------------------------------------------------------- |
| **Backend**   | Node.js, Express.js, JWT, MSSQL (`mssql`), `@azure/storage-blob`, `node-cron`, `ws` (WebSockets) |
| **Frontend**  | React (v19), TypeScript, Vite, React Router, Axios, Material-UI (MUI), Chart.js |
| **AI/ML**     | Python, FastAPI, Pandas, Google Gemini API, Google Programmable Search           |
| **Database**  | Microsoft SQL Server                                                    |
| **DevOps**    | Git, GitHub Actions, Docker, Azure App Service, Netlify                             |

## 4. Building and Running the Project

### Backend (Node.js)

The Node.js backend server can be started from the `/backend/backend-node` directory.

```bash
# Navigate to the backend-node directory
cd backend/backend-node

# Install dependencies
npm install

# Start the server
npm start
```

### Backend (Python)

The Python backend (FastAPI) can be started from the `/backend/backend-python` directory.

```bash
# Navigate to the backend-python directory
cd backend/backend-python

# Install requirements
pip install -r requirements.txt

# Start the FastAPI server
python main.py
```

### Frontend

The frontend development server can be started from the `/frontend` directory. It proxies API requests to the backend running on `http://localhost:3000`.

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

## 5. Development Conventions

-   **Monorepo Structure:** The project is organized as a monorepo with distinct `frontend` and `backend` (node/python) directories. Maintain this separation of concerns.
-   **Azure Blob Storage:** All file persistence is handled via Azure Blob Storage. Use the `storage.js` utility in `backend-node` for file operations.
-   **Real-time Features:** Collaborative features and notifications are powered by WebSockets (`ws`).
-   **Automated Jobs:** Monthly database backups and daily deadline checks are scheduled via `node-cron`.
-   **Type Safety:** The frontend uses TypeScript. Ensure all new code is strongly typed.
-   **API Communication:** Frontend-backend communication happens via RESTful API calls. The Axios instance is pre-configured in `frontend/src/backend connection/axiosConfig.ts` to handle authentication tokens.
-   **Component-Based UI:** The frontend is built with React components, organized by feature under `frontend/src/components`.
-   **State Management:** Global authentication state is managed via `AuthContext` (`frontend/src/context/AuthContext.tsx`).
-   **Environment Variables:** Sensitive information (DB credentials, Azure keys, API keys) is managed in a `.env` file at the root of `backend/`. Do not hardcode these values.
-   **Routing:** Frontend routing is handled by `react-router-dom` in `frontend/src/AppRoutes.tsx`. Backend routing is defined in `backend-node/main.js` and related route files.
-   **Code Style:** Follow the existing coding style found in the project files. The frontend uses ESLint for linting (`frontend/eslint.config.js`).

# Project smartSK Overview

## 1. Architecture
`smartSK` utilizes a monorepo structure with a decoupled microservice architecture:
* **Frontend:** React/Vite/TS with MUI and dedicated CSS Modules
* **Backend-Node:** `/smartSK/backend/backend-node/` handles authentication, routing, and serves as the API gateway
* **Backend-Python:** `/smartSK/backend/backend-python/` is a FastAPI service for predictive analysis and automated data embedding for Excel/PDF exports.

## 2. Interaction Rules
* **Rule 1 (Prioritization):** Follow the sequence: 1. Database -> 2. Backend -> 3. Frontend -> 4. Polishing
* **Rule 2 (Planning):** Always provide a plan for review before any code implementation
* **Rule 3 (Database):** SQL changes must be provided as queries in `Query.txt` for manual execution
* **Rule 4 (Security):** Never scan or read `.env` files
* **Rule 5 (Workflow):** If the user requests an **"execute UI/UX overhaul"**, follow the specialized 3-phase Scanning/Planning/Execution cycle. Otherwise, use the standard 5-phase functional workflow.
* **Rule 6 (Stitch Usage):** Save **Redesign Mode** credits for final execution phases; use **Standard Mode** for planning and wireframing.
* **Rule 7 (Build Integrity):** Ensure `npm run build` is successful during the execution phase to guarantee production-ready code
* **Rule 8 (Feedback):** Read user feedback and formulate a new plan if errors are identified from previous changes