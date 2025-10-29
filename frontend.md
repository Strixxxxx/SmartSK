
# Frontend Documentation

This document provides an overview of the frontend structure and functionality of the smartSK application, built with React, TypeScript, and Vite.

## Directory Structure

```
frontend/
├── public/
└── src/
    ├── assets/
    ├── backend connection/
    ├── components/
    │   ├── Admin/
    │   ├── Client/
    │   ├── ComingSoon/
    │   ├── FlashMessage/
    │   ├── ForgotPassword/
    │   ├── Login/
    │   ├── MaintenanceBanner/
    │   ├── Portal/
    │   ├── Portfolio/
    │   ├── Projects/
    │   ├── RouteGuard/
    │   └── Unauthorized/
    ├── context/
    ├── App.css
    ├── App.tsx
    ├── AppRoutes.tsx
    ├── index.css
    └── main.tsx
```

---
## Packages and Libraries

This section lists the main Node.js packages used in the frontend.

### Dependencies (`package.json`)

-   `@emotion/react`: For CSS-in-JS styling.
-   `@emotion/styled`: Styled components for Emotion.
-   `@mui/icons-material`: Material Design icons from MUI.
-   `@mui/material`: MUI component library.
-   `@mui/x-date-pickers`: Date and time pickers for MUI.
-   `axios`: For making HTTP requests to the backend.
-   `bootstrap-icons`: Icon library.
-   `chart.js`: For creating charts.
-   `chartjs-plugin-datalabels`: A plugin for Chart.js to display labels on data elements.
-   `dayjs`: A lightweight date-time library.
-   `react`: The core React library.
-   `react-bootstrap`: Bootstrap components rebuilt for React.
-   `react-bootstrap-icons`: Bootstrap icons as React components.
-   `react-chartjs-2`: React components for Chart.js.
-   `react-dom`: For rendering React components in the DOM.
-   `react-hook-form`: For managing forms in React.
-   `react-icons`: A collection of popular icon libraries.
-   `react-router-dom`: For routing in a React application.
-   `react-toastify`: For displaying toast notifications.

### Dev Dependencies (`package.json`)

-   `@vitejs/plugin-react`: Vite plugin for React.
-   `eslint`: For static code analysis.
-   `typescript`: For static typing.
-   `vite`: The build tool and development server.

---

## Core Files (`src/`)

### `main.tsx`

The entry point of the application. It renders the root `App` component into the DOM.

### `App.tsx`

The main application component. It sets up the core structure and providers for the entire app.

-   **`LocalizationProvider`**: Wraps the application to provide date localization for `@mui/x-date-pickers`.
-   **`Router`**: `BrowserRouter` from `react-router-dom` to enable routing.
-   **`WebSocketProvider`**: Provides WebSocket connection and state to the application.
-   **`MaintenanceHandler`**: A component that checks for and displays a maintenance page if the backend is in maintenance mode.
-   **`AuthProvider`**: Provides authentication state (user, token, loading status) and methods (`login`, `logout`) to all child components.
-   **`MaintenanceBanner`**: Displays a banner for upcoming or completed maintenance.
-   **`AppRoutes`**: Renders the application's routes.
-   **`ToastContainer`**: Renders the container for toast notifications.

### `AppRoutes.tsx`

This component defines all the client-side routes for the application and handles role-based access control.

-   It uses `react-router-dom` to define `Routes` and `Route` components.
-   It checks if the user is an Admin (`MA` or `SA`) to redirect them to the appropriate dashboard (`/admin/dashboard` or `/dashboard`).
-   It uses an `AdminGuard` to protect all routes under `/admin`.
-   It renders different layouts (`ClientMainLayout`, `AdminLayout`) based on the route.
-   It also includes a check for mobile devices and displays a `ComingSoon` page if the screen width is below a certain threshold.

---

## Backend Connection (`src/backend connection/`)

### `axiosConfig.ts`

This file configures the `axios` instance used for all API communication with the backend.

-   It sets the `baseURL` from the `VITE_BACKEND_SERVER` environment variable.
-   It creates two instances: `publicAxiosInstance` for unauthenticated requests and `axiosInstance` for authenticated requests.
-   **Request Interceptor**: Automatically adds the JWT from `sessionStorage` to the `Authorization` header of every request.
-   **Response Interceptor**: Handles global error responses. It specifically checks for `401 Unauthorized` errors to automatically clear the user's session and trigger a logout. It also handles network timeouts.

### `auth.ts`

This module centralizes all authentication-related logic.

-   **`login(username, password, barangay)`**: Sends login credentials to the backend. On success, it stores the JWT in `sessionStorage` and updates the authentication state.
-   **`logout()`**: Clears the token from `sessionStorage`, notifies the backend, and clears the local authentication state.
-   **`fetchUserData()`**: Fetches the current user's data from the backend and caches it to avoid redundant API calls.
-   **`validateTokenWithBackend()`**: Validates the token stored in `sessionStorage` by making an API call.
-   **`checkPotentialSession()`**: Checks for a session on page load.
-   It manages an in-memory authentication state and cache for user data.

---

## Context Providers (`src/context/`)

### `AuthContext.tsx`

This file defines the `AuthContext` and `AuthProvider` for managing global authentication state.

-   **`AuthProvider`**: A component that wraps the application and provides authentication state (`user`, `isAuthenticated`, `isLoading`) and functions (`login`, `logout`, `refreshUser`) to all components that are descendants.
-   **`useAuth()`**: A custom hook that allows any component to easily access the authentication context.
-   It initializes the auth state by checking `sessionStorage` on application load.
-   It listens for a custom `auth-error` event (dispatched from `axiosConfig.ts`) to automatically log out the user if a 401 error occurs anywhere in the app.

### `WebSocketContext.tsx`

This file sets up the WebSocket connection for real-time communication with the backend.

-   **`WebSocketProvider`**: Establishes and maintains a WebSocket connection. It automatically attempts to reconnect if the connection is lost.
-   It listens for messages from the server, specifically for `maintenance_starting` and `maintenance_ended` events, and updates its state accordingly.
-   **`useWebSocket()`**: A custom hook that allows components to access WebSocket messages (like maintenance notifications).

---

## Components (`src/components/`)

This directory contains all the reusable UI components, organized by feature or page.

### `Admin`

Components related to the administrator dashboard.

#### `Layout/LayoutAdmin.tsx`

The main layout for the admin section. It includes the `Sidebar` and an `Outlet` from `react-router-dom` where the content of the nested admin routes is rendered.

#### `Sidebar/SidebarAdmin.tsx`

The navigation sidebar for the admin dashboard. It contains links to all admin pages and a logout button. The sidebar can be collapsed or expanded.

#### `Dashboard/DashboardAdmin.tsx`

The main dashboard page for administrators, showing summary cards and quick actions. This is a static component.

#### `Account Creation/AccountCreation.tsx`

A component for creating and viewing user accounts.

-   **`GET /api/admin/user-list`**: Fetches and displays a list of existing users.
-   **`POST /api/admin/user-list/create-account`**: Submits a form to create a new user account. It includes client-side validation for the email address.

#### `Roles/Roles.tsx`

A component for managing user roles.

-   It fetches a list of all users and all available roles.
-   Allows an admin to assign or change a user's role via a modal dialog.
-   **`POST /api/roles/assignRole`**: Sends the request to update a user's role.

#### `Projects/AdminProjects.tsx`

Displays a list of all submitted projects within the admin's barangay.

-   Allows admins to view project details and download associated files.
-   Provides functionality to archive a project.
-   **`GET /api/admin/project-list`**: Fetches the list of projects.
-   **`POST /api/admin/proj-archive/:projectId`**: Archives a project.

#### `Raw Data/rawdata.tsx`

A component for managing and viewing raw project data.

-   **`GET /api/rawdata`**: Fetches and displays raw data in a table.
-   **`POST /api/rawdata/upload`**: Handles CSV file uploads to update the raw data.
-   Provides filtering and download (CSV/Excel) functionalities.

#### `Audit Trail/audit.tsx`

Displays the system's audit trail.

-   **`GET /api/audit`**: Fetches and displays a list of all audit log entries in a table.

#### `Session Log/sessions.tsx`

Displays user session logs.

-   **`GET /api/admin/sessions`**: Fetches and displays user login/logout history.
-   Provides filtering by date range and search by username.

#### `Archive/Archive.tsx`

A container component that uses tabs to switch between viewing archived accounts (`accArchive.tsx`) and archived projects (`projArchive.tsx`).

-   **`accArchive.tsx`**: Fetches and displays archived accounts, with an option to restore them.
-   **`projArchive.tsx`**: Fetches and displays archived projects, with an option to restore them.

#### `Backup/Backup.tsx`

Provides an interface for creating and restoring database backups.

-   **`POST /api/admin/backup`**: Initiates a database backup (hybrid or cloud-only).
-   **`POST /api/admin/backup/restore`**: Initiates a database restore from a local file or a cloud backup.
-   It polls the job status and provides feedback to the user.

### `Client`

Components for the regular (non-admin) user dashboard.

#### `Layout/ClientMainLayout.tsx`

The main layout for the client section, including the client sidebar and an `Outlet` for nested routes.

#### `Sidebar/ClientSidebar.tsx`

The navigation sidebar for the client dashboard, with links to the dashboard, projects, and analysis pages.

#### `Dashboard/Dashboard.tsx`

The main dashboard for clients. It includes a "Create Post" button and a feed of recent project posts (`DashboardFeed`).

-   **`CreatePostModal.tsx`**: A modal for creating a new portfolio post with a title, description, and image/video attachments. It handles file uploads asynchronously.
-   **`DashboardFeed.tsx`**: Fetches and displays a grid of `PostCard` components.

#### `Forecast/Forecast.tsx`

The main component for the budget forecasting feature. It contains the `Graph` and `Response` components.

-   **`Graph.tsx`**: Displays a stacked bar chart of budget data. It can be toggled between "by committee" and "by category" views.
-   **`Response.tsx`**: Fetches and displays AI-generated analysis from the backend based on the current view in the `Graph` component.

#### `PredictiveAnalysis/pa.tsx`

The main component for the predictive analysis feature.

-   It provides a form with various filters (category, time period) and checkboxes to customize the analysis report.
-   **`runAnalysis()`**: Sends the selected options to the backend to get a customized AI analysis.
-   **`paResponse.tsx` & `paCstmResponse.tsx`**: Renders the structured analysis received from the backend.
-   **`paTrends.tsx`**: A component for viewing project trends, which can also be customized with filters.

### `Shared Components`

#### `ComingSoon/ComingSoon.tsx`

A simple placeholder page shown on mobile and tablet devices, indicating that the site is not yet available for those screen sizes.

#### `FlashMessage/FlashMessage.tsx`

A component for displaying temporary, auto-dismissing notifications (flash messages) for success, error, or info states.

#### `ForgotPassword/ForgotPassword.tsx`

A multi-step component that guides the user through the password reset process.

-   **`FPUsername.tsx`**: Step 1, collects the user's username or email.
-   **`FPOTP.tsx`**: Step 2, collects the 6-digit One-Time Password sent to the user's email.
-   **`FPChange.tsx`**: Step 3, allows the user to set a new password after successful OTP verification.
-   **`FPSuccess.tsx`**: Step 4, confirms that the password has been successfully reset.

#### `Login/Login.tsx`

A modal component for user login.

-   It collects username, password, and barangay.
-   If a user logs in with a default password, it automatically opens the `NewAccount.tsx` modal to force a password change.

#### `Login/NewAccount.tsx`

A modal component that forces a user to change their default username and password upon first login. It includes password strength validation.

#### `MaintenanceBanner/`

-   **`Maintenance.tsx`**: A full-page component shown when the application is in maintenance mode.
-   **`MaintenanceBanner.tsx`**: A banner displayed at the top of the page to announce upcoming or completed maintenance, based on WebSocket messages.
-   **`MaintenanceHandler.tsx`**: A wrapper component that polls the backend's maintenance status and conditionally renders either the application or the `Maintenance` page.

#### `Portal/portal.tsx`

A modal that appears when a user clicks "Login", prompting them to select their barangay before proceeding to the login form.

#### `Portfolio/`

Components for the public-facing portfolio/project gallery.

-   **`Portfolio.tsx`**: The main landing page of the application. It includes a hero section, about, features, and team sections.
-   **`ProjectList.tsx`**: A page that displays a filterable list of all public project posts.
-   **`PostCard.tsx`**: A card component that displays a summary of a single project post.
-   **`PostModal.tsx`**: A modal that displays the full details of a selected project post, including a gallery for multiple attachments.

#### `Projects/`

Components related to project submission and review.

-   **`Projects.tsx`**: A wrapper component that conditionally renders either `ProjectSubmission` or `ProjectReview` based on the user's role (`SKO` or `SKC`).
-   **`ProjectSubmission.tsx`**: A component for SK Officials to submit new project proposals and view the status of their past submissions.
-   **`ProjectReview.tsx`**: A component for SK Chairpersons to review submitted projects, update their status, and add remarks.
-   **`StatusLegend.tsx`**: A small popover component that displays a legend of all possible project statuses and their meanings.

#### `RouteGuard/`

-   **`AdminGuard.tsx`**: A route guard that checks if the user has an admin role (`MA` or `SA`). If not, it redirects them.
-   **`RouteGuard.tsx`**: A more generic route guard that can protect routes based on authentication status and, optionally, a specific role.

#### `Unauthorized/Unauthorized.tsx`

A simple page shown to users who try to access a route they do not have permission for.
