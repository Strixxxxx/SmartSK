# SmartSK AI Data Flow Diagrams

This document outlines the data flow for the two primary AI-driven processes within the smartSK system: 
1.  **AI-Powered Forecasting and Predictive Analysis**
2.  **AI-Powered Account Registration and Verification**

---

## 1. AI Forecasting & Predictive Analysis Data Flow

This process is triggered automatically on an hourly basis by a cron job. It gathers historical data, performs analysis using both traditional machine learning (LSTM) and generative AI (Google Gemini), and stores the resulting JSON reports for frontend consumption.

```mermaid
graph TD
    subgraph A[Backend: Cron Job Trigger]
        A1(Cron Job in main.js) --> A2{Spawns Python Process};
    end

    subgraph B[Backend: Python AI Orchestration - aiJobs.py]
        B1(aiJobs.py);
        B2(Data Sourcing) --> B1;
        B1 --> B3(Data Standardization);
        B3 --> B4(Data Reshaping);
        B4 --> B5(Report Generation);
        B5 --> B6(Upload Reports);
    end

    subgraph C[Data Sources]
        C1[Azure Blob Storage: Historical CSVs] --> B2;
        C2[MSSQL Database: Raw Data Stored Proc] --> B2;
    end

    subgraph D[AI & ML Models]
        D1[TensorFlow/Keras: LSTM Model]
        D2[Google Gemini API]
    end
    
    subgraph E[Report Generation Modules]
        B5 --> E1(forecast.py);
        B5 --> E2(pa_logic.py);
        B5 --> E3(trends_logic.py);
    end

    subgraph F[Data Storage]
        F1[Azure Blob Storage: JSON Reports]
    end

    subgraph G[Frontend Consumption]
        G1(User on Frontend);
        G1 --> G2{Views Forecast/PA Page};
        G2 --> G3[API Request to Backend];
        G3 --> G4(reports.js);
        G4 --> G5["getReport()"];
        G5 --> F1;
        F1 --> G5;
        G5 --> G4;
        G4 --> G3;
        G3 --> G2;
    end

    A2 --> B1;
    E1 --> D1;
    E1 --> D2;
    E2 --> D1;
    E2 --> D2;
    E3 --> D2;
    B6 --> F1;
```

### Flow Description:

1.  **Trigger**: An hourly cron job in `main.js` initiates the process by spawning `backend/AI/aiJobs.py`.
2.  **Data Sourcing**: `aiJobs.py` first attempts to fetch historical project data from CSV files stored in an Azure Blob Storage container. If this fails, it falls back to executing a stored procedure in the MSSQL database.
3.  **Processing**: The script standardizes categories and committees, normalizes column names, and reshapes the data from a wide to a long format suitable for analysis.
4.  **AI Analysis**:
    *   `forecast.py` uses an LSTM model (TensorFlow/Keras) for quantitative budget forecasting and calls the Google Gemini API for qualitative analysis of the results.
    *   `pa_logic.py` and `trends_logic.py` use the processed historical data to generate prompts for the Google Gemini API, which returns predictive analysis and project trends.
5.  **Storage**: The generated JSON reports (`forecast.json`, `pa_analysis.json`, `pa_trends.json`) are uploaded to a dedicated container in Azure Blob Storage.
6.  **Consumption**: When a user navigates to the "Forecast" or "Predictive Analysis" pages on the frontend, an API call is made to the Node.js backend. The backend retrieves the corresponding pre-generated JSON file from Azure Storage and sends it to the frontend for rendering.

---

## 2. AI-Powered Account Registration Data Flow

This process is triggered when a user submits the registration form on the frontend. It involves data encryption, document watermarking, and a series of AI-powered verification steps to approve or reject the application automatically.

```mermaid
graph TD
    subgraph A[Frontend: User Interaction]
        A1(User fills out Registration Form) --> A2{Submits Form};
    end

    subgraph B[Backend: Node.js Initial Processing]
        B1(POST /api/register);
        B2(Encrypts PII);
        B3(Watermarks & Uploads ID Images);
        B4(Saves to preUserInfo DB);
        B5{Spawns Python Process};
    end

    subgraph C[Backend: Python AI Verification - accountAIJobs.py]
        C_spacer[" "]
        style C_spacer stroke:none,fill:none
        C1(accountAIJobs.py);
        C_spacer ~~~ C1;
        C2(Fetches User & ID Data);
        C1 --> C2;
        C2 --> C3(Gemini API: ID Type Check);
        C2 --> C4(Gemini API: OCR Data Extraction);
        C4 --> C5(Verification Logic);
        C3 --> C5;
        C5 --> C6(Decision: Approve/Reject);
        C6 --> C7(Updates DB Status);
    end

    subgraph D[Data Stores]
        D1[MSSQL Database];
        D2[Azure Blob Storage: Registration Docs];
        D3[Azure Blob Storage: SK Official Lists];
    end

    subgraph E[Backend: Finalization]
        E1(handleAIJobCompletion);
        E2(Sends Email Notification);
        E3(Adds Final Audit Log);
        E1 --> E2;
        E1 --> E3;
    end
    
    subgraph F[Admin Override Flow]
        F1(Admin Views Audit Log) --> F2{Manual Override};
        F2 --> F3(POST /api/admin/audit/override);
        F3 --> F4(Executes Stored Procedure);
        F4 --> D1;
    end

    A2 --> B1;
    B1 --> B2;
    B2 --> B4;
    B1 --> B3;
    B3 --> D2;
    B4 --> D1;
    B5 --> C1;
    
    C2 --> D1;
    C2 --> D2;
    C2 --> D3;
    
    C7 --> D1;
    C6 -- "on completion" --> E1;
```

### Flow Description:

1.  **Submission**: A user fills out the registration form on the frontend, providing PII and uploading front/back images of their ID.
2.  **Initial Handling**: The Node.js backend receives the submission. It encrypts sensitive PII, watermarks the ID images, and uploads them to a secure Azure Blob Storage container. The encrypted user data is saved to a temporary `preUserInfo` table in the database.
3.  **AI Trigger**: The Node.js backend spawns the `accountAIJobs.py` script, passing the new user's ID.
4.  **AI Verification**:
    *   The Python script fetches the user's data from the database and downloads their ID images and the corresponding SK Officials list from Azure.
    *   It makes two calls to the **Google Gemini API**: one to identify the ID type and another to perform OCR to extract text (name, DOB, address).
    *   It runs internal verification logic, comparing the form data against the AI-extracted data and the SK officials list.
5.  **Decision & DB Update**: Based on the verification results, the script decides to 'approve' or 'reject' the application. It then updates the user's status in the database accordingly, either by moving them to the main `userInfo` table via a stored procedure or by marking them as rejected. A detailed verification report is saved to the `registrationAudit` table.
6.  **Finalization**: When the Python script completes, it triggers a final function in the Node.js backend which sends an approval or rejection email to the user.
7.  **Admin Override**: An administrator can view the AI's decision in the audit trail. If necessary, they can manually override the decision, which directly executes a stored procedure to approve or reject the user in the database.

---

## 3. AI-Powered Project Proposal Review Data Flow

This process is triggered when an SK Official submits a project proposal. It uses AI to analyze the attached document against a set of configurable rules, providing an automated initial assessment for the SK Chairperson to review.

```mermaid
graph TD
    subgraph A[Frontend: User Interaction]
        A1(SK Official fills out Project Proposal Form) --> A2{Submits Form & Document};
    end

    subgraph B[Backend: Node.js Initial Processing - projectSubmission.js]
        B1(POST /api/projects/submit);
        B2(Encrypts Project Details);
        B3(Uploads Document to Azure);
        B4(Saves to 'projects' DB table);
        B5{Spawns Python Process};
    end

    subgraph C[Backend: Python AI Verification - projectAIJobs.py]
        C_spacer[" "]
        style C_spacer stroke:none,fill:none
        C1(projectAIJobs.py);
        C_spacer ~~~ C1;
        C2(Fetches Project Doc & Rules);
        C1 --> C2;
        C3(Extracts Text from Document);
        C2 --> C3;
        C4(Gemini API: Analyze Doc vs Rules);
        C3 --> C4;
        C5(Decision: Approve/Reject);
        C4 --> C5;
        C6(Saves Report to 'projectAudit' DB);
        C5 --> C6;
    end

    subgraph D[Data Stores]
        D1[MSSQL Database];
        D2[Azure Blob Storage: Project Documents];
        D3[Azure Blob Storage: AI Project Rules Container];
    end

    subgraph E[SK Chairperson: Rule Management]
        E1(SKC Edits Rules in UI) --> E2(POST /api/projectaudit/ai-rules);
        E2 --> E3(projectAudit.js);
        E3 --> D3;
    end

    subgraph F[Admin: Audit & Override]
        F1(SKC Views AI Audit Log) --> F2{Manual Override};
        F2 --> F3(POST /api/projectaudit/manual-override);
        F3 --> F4(projectAudit.js);
        F4 --> D1;
    end

    A2 --> B1;
    B1 --> B2;
    B2 --> B4;
    B1 --> B3;
    B3 --> D2;
    B4 --> D1;
    B5 --> C1;

    C2 --> D1;
    C2 --> D2;
    C2 --> D3;

    C6 --> D1;
```

### Flow Description:

1.  **Submission**: An SK Official submits a new project proposal, including a title, description, and a project document (PDF/DOCX).
2.  **Initial Handling**: The `projectSubmission.js` endpoint encrypts the project details, uploads the document to a secure Azure Blob Storage container, and saves the initial project record to the `projects` table with a status like `Pending AI Review`.
3.  **AI Trigger**: The Node.js backend then spawns the `projectAIJobs.py` script, passing the new `projectID`.
4.  **AI Verification**:
    *   The Python script fetches the project's document path and the submitter's barangay name from the database.
    *   It downloads the project document and the corresponding rules file (e.g., `PROJECT RULES - [barangayName].txt`) from the `AIPROJ_CONTAINER` in Azure Storage.
    *   It extracts the text from the document and sends it along with the rules to the **Google Gemini API** for analysis.
    *   The AI returns a decision ('approved'/'rejected') and a detailed report.
5.  **Decision & DB Update**: The script saves the detailed verification report into the `projectAudit` table. The project's primary status is updated to reflect the AI's assessment (e.g., `AI Approved` or `AI Rejected`), awaiting final confirmation from the SK Chairperson.
6.  **Rule Management**: The SK Chairperson can, at any time, update the AI criteria for their barangay through a dedicated UI. Saving these rules updates the corresponding text file in Azure Blob Storage via the `projectAudit.js` endpoint.
7.  **Admin Audit & Override**: The SK Chairperson reviews the AI's decisions in the "AI Review" tab. If they disagree, they can use the "Override" functionality. This action updates the project's final status in the `projects` table and logs the manual action, justification, and the admin's identity in the `projectAuditManual` table.