# SmartSK: Sangguniang Kabataan Management System

[![React](https://img.shields.io/badge/Frontend-React%2019-blue)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20Express-green)](https://nodejs.org/)
[![FastAPI](https://img.shields.io/badge/AI%20Service-FastAPI-009688)](https://fastapi.tiangolo.com/)

SmartSK is a sophisticated full-stack web application designed specifically for **Sangguniang Kabataan (SK)** councils in the Philippines. It streamlines project management, budget tracking, and data-driven decision-making through advanced AI-powered analytics.

---

## 📂 Project Structure

The repository is organized into two primary components:

*   [**Backend**](./backend/README_BACKEND.md): Contains the Node.js API Gateway and the Python-based microservice.
*   [**Frontend**](./frontend/README_FRONTEND.md): A modern React application built with TypeScript and Material-UI.

---

## 🛠️ Technology Stack

### Core Architecture
- **Monorepo Architecture**: Decoupled microservices for scalability and maintainability.
- **Backend-Node**: Express.js RESTful API, JWT Authentication, and WebSockets for real-time updates.
- **Backend-Python**: FastAPI service dedicated to data analysis and AI report generation.
- **Database**: Microsoft SQL Server (MSSQL).
- **Storage**: Azure Blob Storage for secure and scalable file management.

### AI & Analytics
- **Google Gemini API**: Powers textual analysis, predictive insights, and automated report generation.
- **Predictive Modeling**: Python-based forecasting using LSTM models and advanced data processing.
- **Automated Verification**: AI-driven user registration audit and project compliance checking.

---

## 🚀 Key Features

- **✅ AI-Powered Registration**: Intelligent verification of user IDs to ensure data consistency and authenticity.
- **📊 Advanced Analytics**: Budget forecasting, trend analysis, and predictive recommendations for SK projects.
- **🔐 Role-Based Access Control (RBAC)**: Tailored dashboards for Administrators, SK Chairpersons, and SK Officials.
- **📁 Secure File Management**: Seamless integration with Azure Blob Storage for project documents and system backups.
- **📅 Automated Maintenance**: Scheduled database backups and cleanup jobs via `node-cron`.
- **💬 Real-Time Communication**: WebSocket-driven notifications for system maintenance and post updates.

---

## 📜 Version History

For a detailed breakdown of the UI/UX evolution, backend logic shifts, and package changes across versions, please see the [**Detailed Version History**](./VERSION_HISTORY.md).

*   **V1 (Initial Phase)**: Included backend only with no homepage. Admin and client interfaces were combined into a single page and conditionally hidden based on roles. Forecasting focused on Project Implementation using Meta's Prophet.
*   **V2 (AI Integration)**: Introduced the homepage. Forecasting was upgraded to use the Gemini API and LSTM, adding predictive trends that updated hourly. The Node.js server communicated with Python scripts via Child Process Spawn.
*   **V3 (Current Architecture)**: Removed legacy Posting and Project modules, replacing them with a comprehensive Project Workspace, Project Tracker, and a Full Disclosure Board/Bulletin Board. Introduced AI Registration Verification with manual overriding and Budget Allocations. The Python backend was migrated to a robust FastAPI microservice architecture.

---

## ⚙️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Python 3.9+](https://www.python.org/)
- [Microsoft SQL Server](https://www.microsoft.com/en-us/sql-server/)

### Quick Start
1. **Clone the repository**:
   ```bash
   git clone https://github.com/Bratnya/SmartSK.git
   cd SmartSK
   ```

2. **Backend Setup**:
   Follow the instructions in the [Backend README](./backend/README_BACKEND.md).

3. **Frontend Setup**:
   Follow the instructions in the [Frontend README](./frontend/README_FRONTEND.md).

---
