# Smart SK Detailed Version History

This document provides a comprehensive breakdown of the evolutionary improvements of the Smart SK project from Version 1 up to the current Version 3. It highlights the significant changes in UI/UX, backend logics, and package utilization that have matured the platform into a production-grade application.

---

## Version 1: The Initial Phase

### 1. UI/UX & Layout Choices
- **UI Architecture:** Admin and client interfaces were combined into a single page. Elements were conditionally hidden based on roles rather than having dedicated dashboard layouts. There was **no homepage** for public or non-authenticated users.
- **UI Libraries:** Relied primarily on a mixture of basic `@mui/material` and `react-bootstrap`. 
- **Layout:** The layout was simple and functional, focusing on rendering basic data tables and forms.
- **UX:** Navigation was basic. User actions required manual page refreshes to see state changes.

### 2. Backend Logics
- **Architecture:** A monolithic Node.js Express server.
- **Data Flow:** Direct database connections via `mssql` with synchronous processing for most tasks.
- **AI Integration:** Basic Python integration. The backend used `child_process` to spawn Python scripts located in a simple `pyBridge` folder.
- **Security:** Focused on core authentication using JSON Web Tokens (JWT) and fundamental Role-Based Access Control (RBAC).

### 3. Package Ecosystem
- **Frontend:** `react-bootstrap`, `chart.js` (basic implementations).
- **Backend:** `express`, `jsonwebtoken`, `mssql`.
- **AI/ML:** Relied heavily on **Meta's Prophet** for simple time-series forecasting focused purely on Project Implementation.

---

## Version 2: AI Integration & Cloud Expansion

### 1. UI/UX & Layout Choices
- **UI Architecture:** Introduced a dedicated Homepage. The frontend was restructured to provide distinctly different layouts tailored specifically to user roles (Admin vs. Standard User).
- **UI Libraries:** Completely dropped `react-bootstrap` to standardize the entire frontend on `@mui/material`, providing a more professional and cohesive design system.
- **Data Visualization:** Charts were upgraded to use `react-chartjs-2` for more dynamic, responsive rendering of the new AI forecasting data.
- **UX:** Introduced real-time alerts. Toast notifications (`react-toastify`) were deeply integrated to provide instant feedback on actions.

### 2. Backend Logics
- **Architecture:** Retained the monolithic Express server but heavily refactored for asynchronous operations and external cloud integrations.
- **AI Orchestration:** Forecasting was completely overhauled. The Python scripts, still triggered via `child_process` spawn, were migrated to a dedicated `AI` directory. Predictive trends were introduced and updated hourly.
- **Real-Time Capabilities:** Introduced `ws` (WebSockets) to broadcast system-wide events to all connected clients instantly.
- **Background Processing:** Introduced `node-cron` to schedule heavy tasks—like the hourly AI analytics generation and monthly database backups—without blocking the main API thread.
- **Cloud File Management:** Migrated media handling to `Azure Storage Blob`. Added advanced media processing using `sharp` (watermarking) and `fluent-ffmpeg` (compression).

### 3. Package Ecosystem
- **Frontend:** `@mui/material`, `react-toastify`, `axios` (with advanced token interceptors).
- **Backend:** `node-cron`, `ws`, `multer`, `sharp`, `fluent-ffmpeg`, `@azure/storage-blob`, `archiver` (for encrypted backups).
- **AI/ML:** Shifted from `Prophet` to **TensorFlow (LSTM models)** for complex forecasting. Deeply integrated the **Google Gemini API** for textual predictive analysis and trend generation. Document compliance parsing was added using `pypdf` and `python-docx`.

---

## Version 3 (Current): The Microservice Architecture

### 1. UI/UX & Layout Choices
- **UI Architecture:** Legacy "Posting" and standard "Project" modules were completely removed and replaced with a comprehensive **Project Workspace**, a sophisticated **Project Tracker**, and a **Full Disclosure Board/Bulletin Board**.
- **Layout:** Major overhauls to the Admin interfaces, moving filter controls to intuitive locations and adopting a "government-style", premium aesthetic with modern toggle switches.
- **UX:** Real-time data synchronization was perfected. Changes to Budgets and User Roles now utilize targeted WebSocket broadcasts to instantly update connected clients' UI without a page reload. Added `react-markdown` to beautifully format the generative AI responses within the dashboard. Complex workflows like AI Registration Verification now feature smooth manual override UX flows.

### 2. Backend Logics
- **Architecture (Decoupled Microservices):** The most significant architectural leap. The monolithic backend was completely split. The Python logic was migrated from a `child_process` execution model into a robust, standalone **FastAPI** microservice (`backend-python`). The Node API (`backend-node`) now communicates with the AI service via HTTP REST calls instead of local spawning.
- **Containerization:** Introduction of `docker-compose.yml`, allowing both the Node and Python environments to run in isolated Docker containers, standardizing deployment.
- **Advanced Logic:** Introduced **AI Registration Verification** (ID parsing and cross-referencing) and complex logic for **Targeted Audit Reversions**, allowing authorized users to securely "undo" specific actions while automatically recalculating project budgets and logging reversions transparently.

### 3. Package Ecosystem
- **Frontend:** Continued refinement of Vite builds (`@vitejs/plugin-react`). Integration of `react-markdown`.
- **Backend (Node):** Retained the robust stack from V2 but restructured the execution logic to support the microservice approach.
- **Backend (Python):** Shifted entirely to **FastAPI** to serve models and Gemini interactions as dedicated, scalable REST endpoints rather than script executions.
