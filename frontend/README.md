# SmartSK Frontend (Client Application)

The SmartSK frontend is a modern, responsive Single Page Application (SPA) built to provide a premium user experience for SK officials and administrators.

---

## 📂 Architecture & Design

### UI Framework: [Material-UI (MUI)](https://mui.com/)
- **Design System**: Follows a clean, modern government-style aesthetic.
- **Theming**: Dark mode and light mode support with consistent brand colors.

### Styling: [CSS Modules](https://github.com/css-modules/css-modules)
- **Scoped Styles**: Every component has its own `.module.css` file to prevent style leakage.
- **BEM-like approach**: Ensures maintainability and clarity in layout structures.

### State Management
- **AuthContext**: Global state for user authentication and session persistence.
- **WebSocketContext**: Real-time listeners for system events and content updates.

---

## 🛠️ Technology Stack

- **Core**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Routing**: [React Router DOM](https://reactrouter.com/)
- **Networking**: [Axios](https://axios-http.com/) with centralized interceptors for Auth tokens.
- **Data Visualization**: [Chart.js](https://www.chartjs.org/) for analytics and forecasting graphs.

---

## 🚀 Development Workflow

### Installation
```bash
npm install
```

### Local Development
The application is configured to proxy API requests to `http://localhost:3000` by default.
```bash
npm run dev
```

### Production Build
Always ensure the build succeeds before deploying to production (Netlify).
```bash
npm run build
```

---

## 📄 Key Modules

- `src/components/Admin`: High-fidelity dashboards for system administration.
- `src/components/Client`: Functional modules for SK official submissions and analytics.
- `src/backend connection`: Centralized API logic and Axios interceptors.
- `src/context`: React Context providers for global application state.
