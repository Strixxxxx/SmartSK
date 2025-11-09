# Project smartSK Overview

This document provides a comprehensive overview of the `smartSK` project, including its purpose, architecture, and development conventions, to guide future interactions with the Gemini assistant.

## 1. Project Purpose

`smartSK` is a full-stack web application designed to assist Sangguniang Kabataan (SK) councils in the Philippines. It provides a platform for managing projects, budgets, and data analysis.

The system features role-based access control for administrators and standard users, offering tailored dashboards and functionalities for each. Its core purpose is to streamline project submission, review, and monitoring, while leveraging AI-powered tools for forecasting and predictive analysis to support data-driven decision-making.

## 2. Architecture

The project is a monorepo containing a separate frontend and backend.

-   **Backend (`/backend`):** A Node.js application built with the Express.js framework. It serves a RESTful API for all application functionalities, including user authentication (JWT), data management, and file uploads. It also acts as a bridge to a Python-based AI module.
-   **Frontend (`/frontend`):** A modern single-page application (SPA) built with React and TypeScript. It uses Vite for the build tooling and development server. The UI is constructed with Material-UI (MUI) components, and it communicates with the backend via HTTP requests managed by Axios.
-   **AI/ML (`/backend/AI`):** A collection of Python scripts that perform data analysis, forecasting, and predictive modeling. These scripts use libraries like Pandas and connect to Google's Gemini API. The Node.js backend executes these scripts via a "Python Bridge."
-   **Database:** The application uses Microsoft SQL Server as its relational database.
-   **Deployment:** The backend is containerized using Docker and deployed on Azure App Service, while the frontend is hosted on Railway. A CI/CD pipeline is set up with GitHub Actions.

## 3. Key Technologies

| Category      | Technology                                                              |
| :------------ | :---------------------------------------------------------------------- |
| **Backend**   | Node.js, Express.js, JWT, MSSQL, Multer, Nodemailer                     |
| **Frontend**  | React, TypeScript, Vite, React Router, Axios, Material-UI (MUI), Chart.js |
| **AI/ML**     | Python, Pandas, Google Gemini API, Google Programmable Search           |
| **Database**  | Microsoft SQL Server                                                    |
| **DevOps**    | Git, GitHub Actions, Docker, Azure, Railway                             |

## 4. Building and Running the Project

### Backend

The backend server can be started from the `/backend` directory.

```bash
# Navigate to the backend directory
cd backend

# Install dependencies
npm install

# Start the server
npm start
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

-   **Monorepo Structure:** The project is organized as a monorepo with distinct `frontend` and `backend` directories. Maintain this separation of concerns.
-   **Type Safety:** The frontend uses TypeScript. Ensure all new code is strongly typed.
-   **API Communication:** Frontend-backend communication happens via RESTful API calls. The Axios instance is pre-configured in `frontend/src/backend connection/axiosConfig.ts` to handle authentication tokens.
-   **Component-Based UI:** The frontend is built with React components, organized by feature under `frontend/src/components`.
-   **State Management:** Global authentication state is managed via `AuthContext` (`frontend/src/context/AuthContext.tsx`).
-   **Environment Variables:** The backend uses a `.env` file to manage sensitive information like database credentials and API keys. Do not hardcode these values.
-   **Routing:** Frontend routing is handled by `react-router-dom` in `frontend/src/AppRoutes.tsx`. Backend routing is defined in `backend/main.js` and related route files.
-   **Code Style:** Follow the existing coding style found in the project files. The frontend uses ESLint for linting (`frontend/eslint.config.js`).

## 6. Gemini Interaction Rules
-   **Rule1:** Gemini CLI must adhere to a prioritized workflow for development tasks. The order of operations is as follows: 1st - Database, 2nd - Backend, 3rd - Frontend, and 4th - Polishing (e.g., addressing minor errors, UI/UX adjustments).
-   **Rule2:** Gemini CLI must make a plan that the user would read before implementing the change in the code structure.
-   **Rule3:** Gemini CLI must properly understand the user's prompt to create a proper plan that was mentioned in Rule 1.
-   **Rule4:** The Gemini CLI must always ask if the Gemini CLI would proceed to the changes.
-   **Rule5:** Gemini CLI must provide production-ready code to make sure that nothing will happen when the system is deployed.
-   **Rule6:** When Gemini CLI must change something on the database, instead of adding a query that would require the user to be executed, it would only provide a query that can be followed by the user.
-   **Rule7:** The Gemini CLI must put all SQL-related queries inside of Query.txt.
-   **Rule8:** The user will always do the database-related changes manually instead of using Gemini CLI.
-   **Rule9:** The user would always send a feedback prompt every time that the Gemini CLI changed something in the code.
-   **Rule10:** Gemini CLI must always read the user's feedback and formulate a plan if the user's feedback has some error from the code changes that Gemini CLI did.
-   **Rule11:** Gemini CLI must always identify the mistake faster to avoid repetitive prompts to fix the error.
-   **Rule12:** Gemini CLI must always scan all relevant files in the prompt since most of the files are always updated instead of reading in memory.
-   **Rule13:** Gemini CLI must be precise & concise when it comes to plan details, code structure, and resourcefulness to make the work easier.
-   **Rule14:** Gemini CLI must learn from its previous mistakes to avoid repeating them.
-   **Rule15:** The Gemini CLI must always follow the rules that were dictated above for faster, efficient, and collaborative work with the user.


## 6.1. Gemini Interaction Rules on the Frontend Directory
- **Rule1:** When Gemini CLI changes something on the frontend, Gemini CLI would always take note that the frontend programming language is React Vite Typescript.
- **Rule2:** When Gemini CLI added a new TSX file, Gemini CLI had to make sure that the route would be put on the AppRoutes.tsx file if needed.
- **Rule3:** Gemini CLI must make sure that the code changes won't cause an error when the user runs the 'npm run build' command. Gemini CLI must run the command 'npm run build' automatically without the user's permission to make sure nothing will be left behind once the changes in the frontend are done.
- **Rule4:** Gemini CLI must make sure that the newly created & existing TSX files properly call the axiosConfig.ts file if needed to be connected to the backend.
- **Rule5:** Gemini CLI must adhere to the rules mentioned above to make sure nothing wrong happens to the frontend directory.

## 6.2. Gemini Interaction Rules on the Backend Directory
- **Rule1:** When Gemini CLI changes something on the backend, Gemini CLI would always take note that the backend programming language is Node JS.
- **Rule2:** Gemini CLI must always remember that there are 2 programming languages that exist on the backend. The first is Node.js, which focuses on the main backend functionalities. The second is Python, which focuses on the AI/ML-related functionalities.
- **Rule3:** Gemini CLI must make sure that the routers is added to the main.js file if needed and has conditionally applied middleware and error logging if it's invalid.
- **Rule4:** Gemini CLI must always remember that Node.js can call the Python files via aiJobs.py using child process spawn to execute the asynchronous job.
- **Rule5:** Gemini CLI must adhere to the rules mentioned above to make sure nothing wrong happens to the backend directory.