# SmartSK System Architecture

This document provides diagrams illustrating the deployment and infrastructure architecture of the SmartSK system.

## Deployment Architecture

This diagram illustrates the current CI/CD and deployment process for the SmartSK system, based on the GitHub Actions workflow and hosting provider configurations.

```mermaid
graph TD
    subgraph "Development & Source Control"
        Dev[Developer] -- "1. Push to main branch" --> GitHub[GitHub Repository];
    end

    subgraph "CI/CD Pipelines"
        GitHub -- "2a. Triggers Backend Deploy" --> GHA(GitHub Actions);
        GitHub -- "2b. Triggers Frontend Deploy" --> Railway(Railway.com Auto-Deploy);
    end

    subgraph "Azure Cloud (Public Endpoints)"
        GHA -- "3a. Build & Push Docker Image" --> ACR[Azure Container Registry];
        ACR -- "4. App Service pulls image" --> AppService["Azure App Service (Basic B1)<br><i>smartsk-backend-container</i><br>Contains Node.js + Python runtime"];
    end

    subgraph "Frontend Hosting (Third-Party)"
        Railway -- "3b. Builds & Deploys Frontend" --> Frontend[React SPA on Railway.com];
    end

    subgraph "User Interaction"
        User[End User] -- "HTTPS" --> Frontend;
        Frontend -- "API Calls via HTTPS" --> AppService;
    end
```

## Infrastructure Design

This diagram shows the high-level logical design of the provisioned cloud infrastructure and the data flow between the system components and external services.

```mermaid
graph TD
    subgraph "User"
        User1[End User]
    end

    subgraph "Frontend Hosting (Railway)"
        Frontend1[React SPA]
    end

    subgraph "Azure Cloud Infrastructure"
        AppService1["Azure App Service<br>(Node.js Backend)"]
        SQLDB["Azure SQL Database<br>(Primary Data Store)"]
        Storage["Azure Storage Account<br>(File Uploads & Backups)"]
    end

    subgraph "External Services"
        Gemini["Google AI Platform<br>(Gemini API)"]
        GoogleSearch["Google Programmable Search"]
        Gmail["Gmail SMTP Server"]
    end

    %% Data Flows
    User1 -- "HTTPS" --> Frontend1
    Frontend1 -- "API Calls (HTTPS)" --> AppService1

    AppService1 -- "Database Queries" --> SQLDB
    AppService1 -- "Blob Storage (Uploads/Downloads)" --> Storage
    AppService1 -- "AI Analysis API" --> Gemini
    AppService1 -- "Web Search API" --> GoogleSearch
    AppService1 -- "SMTP for Email" --> Gmail
```

## Detailed Infrastructure Design

This diagram provides a more granular view of the backend architecture, breaking down the Azure App Service into its logical software components and showing their specific interactions.

```mermaid
graph TD
    subgraph "User"
        User2[End User]
    end

    subgraph "Frontend Hosting (Railway)"
        Frontend2[React SPA]
    end

    subgraph "Azure Cloud Infrastructure"
        subgraph AppService2 ["Azure App Service (Backend)"]
            direction LR
            API["REST API<br>(Express.js)"]
            Auth["Auth Service<br>(JWT, Sessions)"]
            AIBridge["AI Bridge<br>(Python Scripts)"]
            Backup["Backup Service<br>(node-cron)"]
            Email["Email Service<br>(Nodemailer)"]
        end

        SQLDB2["Azure SQL Database<br>(Primary Data Store)"]
        Storage2["Azure Storage Account<br>(File Uploads & Backups)"]
    end

    subgraph "External Services"
        Gemini2["Google AI Platform<br>(Gemini API)"]
        GoogleSearch2["Google Programmable Search"]
        Gmail2["Gmail SMTP Server"]
    end

    %% Data Flows
    User2 -- "HTTPS" --> Frontend2
    Frontend2 -- "API Calls" --> API

    API -- "Validates Token" --> Auth
    API -- "Manages Data" --> SQLDB2
    API -- "Triggers Analysis" --> AIBridge
    API -- "Triggers Emails" --> Email
    API -- "Manages Files" --> Storage2

    AIBridge -- "Analysis API" --> Gemini2
    AIBridge -- "Search API" --> GoogleSearch2
    Email -- "SMTP" --> Gmail2
    Backup -- "Scheduled Job" --> Storage2
    Backup -- "Reads DB" --> SQLDB2
```