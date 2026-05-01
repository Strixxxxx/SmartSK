# SmartSK Backend Services

The SmartSK backend is composed of two specialized services designed to handle core business logic, authentication, and AI-driven data processing.

---

## 🚀 Services Overview

### 1. [Node.js Backend](./backend-node/) (API Gateway & Core Logic)
Built with **Express.js**, this service acts as the primary API for the frontend.
- **Authentication**: JWT-based session management and RBAC.
- **Real-time**: WebSocket implementation for system-wide notifications.
- **Scheduling**: Automated jobs for AI reports and database backups using `node-cron`.
- **Storage Integration**: Direct interface with Azure Blob Storage via `@azure/storage-blob`.

### 2. [Python Backend](./backend-python/) (AI/ML Service)
A **FastAPI** service dedicated to heavy data lifting and generative AI.
- **Generative AI**: Integration with Google Gemini for report synthesis and predictive analysis.
- **Forecasting**: Data processing and forecasting using optimized mathematical models (LSTM).
- **Compliance**: AI audits for user registration and project submissions.

---

## 📜 Backend Version History

*   **V1**: Backend only. Admin and client interfaces were served directly. Forecasting relied on Meta's Prophet for Project Implementation.
*   **V2**: Node.js served a new homepage. Forecasting migrated to Gemini API and LSTM with hourly updates. Node.js communicated with Python scripts via Child Process Spawn.
*   **V3 (Current)**: The Python environment was decoupled into a dedicated FastAPI microservice for improved scalability and stability. Added support for AI Registration Verification (with manual overrides) and Budget Allocations. Legacy modules (Posting, old Project module) were removed in favor of Project Workspace and Full Disclosure Board.

---

## 📦 Core Dependencies

| Node.js Service | Python Service |
| :--- | :--- |
| `express`, `mssql`, `jsonwebtoken` | `fastapi`, `uvicorn`, `pandas` |
| `@azure/storage-blob`, `ws` | `google-generativeai`, `sqlalchemy` |
| `bcrypt`, `node-cron` | `pydantic`, `python-dotenv` |

---

## 🛠️ Configuration

Both services require environment variables to be defined in a `.env` file at the root of the `backend/` directory.

> [!CAUTION]
> Never commit your `.env` file to version control.

Required configuration includes:
- **MSSQL Connection**: Server, Username, Password, Database.
- **Azure Storage**: Account Name, Account Key, Container names.
- **AI Keys**: Google Gemini API Key.
- **JWT Secret**: For secure session signing.

---

## 🏃 Running the Services

### Node.js Backend
```bash
cd backend-node
npm install
npm start
```

### Python Backend
```bash
cd backend-python
pip install -r requirements.txt
python main.py
```
