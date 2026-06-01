# G2C POS - Frontend

G2C POS is a modern, responsive web-based Point of Sale (POS) system designed for managing sales, products, customers, and installments. It is built as a Single Page Application (SPA) using Vanilla JavaScript and leverages PocketBase for its backend and real-time capabilities.

## Project Overview

-   **Purpose:** A lightweight and efficient POS system for managing retail operations.
-   **Architecture:** Vanilla JavaScript SPA with ES Modules.
-   **Backend:** PocketBase (serving as the database, authentication provider, and real-time event engine).
-   **Frontend Tech Stack:**
    -   **HTML5/CSS3**
    - **Tailwind CSS** (Production-ready via CLI) for utility-first styling.
    -   **PocketBase JS SDK** (via ESM) for data synchronization.
    -   **Phosphor Icons** for iconography.
    -   **SweetAlert2** for interactive alerts and modals.
    -   **Tom Select** for searchable dropdowns.
-   **Infrastructure:**
    -   **Nginx (Alpine):** Serves static files and acts as a reverse proxy for PocketBase API calls.
    -   **Docker:** Containerized for easy deployment.
    -   **K3s:** Target orchestration platform.

## Directory Structure

```text
frontend/
├── index.html          # Main application entry point and UI layout
├── Dockerfile          # Nginx-based container configuration
├── default.conf        # Nginx configuration (proxying /api to PocketBase)
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker for PWA support
├── css/
│   └── style.css       # Custom styles and overrides
├── js/
│   ├── app.js          # Core logic: routing, view switching, and real-time initialization
│   ├── api.js          # PocketBase client setup
│   ├── state.js        # Global application state management
│   ├── auth.js         # Authentication logic (Email & OAuth2)
│   ├── pos.js          # POS-specific logic (Cart, Product rendering)
│   ├── products.js     # Product and Set management
│   ├── customers.js    # Customer management and profiles
│   ├── orders.js       # Order processing, history, and installments
│   ├── ui.js           # UI helper functions (Sidebar, Panels)
│   └── utils.js        # Utility functions
└── icon/               # Application icons and assets
```

## Key Commands

### Building and Containerization

The project uses a multi-stage Docker build to compile Tailwind CSS and serve the application with Nginx.

```bash
# Build the Docker image (includes Tailwind CSS compilation)
docker build -t g2c-web:latest .
```

# Run the container locally (assuming PocketBase is accessible)
docker run -p 80:80 g2c-web:latest
```

### Deployment

To restart the deployment on a K3s cluster:

```bash
kubectl rollout restart deployment g2c-frontend -n g2c
```

## Development Conventions

-   **Vanilla JavaScript:** Avoid adding heavy frameworks. Use ES Modules for organization.
-   **State Management:** Maintain the global application state in `js/state.js`. Update UI components based on state changes.
-   **Real-time Updates:** Utilize PocketBase's subscription feature in `js/app.js` to ensure the UI stays in sync with the database across all clients.
-   **Styling:** Prefer Tailwind CSS utility classes in `index.html`. Complex or reusable styles should go into `css/style.css`.
-   **Language:** The primary user interface language is Thai (`lang="th"`).
-   **PWA:** Ensure changes are compatible with PWA requirements (manifest, service worker, and HTTPS in production).

## Nginx Configuration (`default.conf`)

The Nginx configuration is critical as it handles:
1.  **Static File Serving:** Root points to `/usr/share/nginx/html`.
2.  **Reverse Proxy:** Requests to `/api/` or `/_/` are proxied to the PocketBase service (`pocketbase-prod-svc.g2c.svc.cluster.local:8090`).
3.  **Real-time Support:** `proxy_buffering off` and `proxy_read_timeout 3600s` are configured to support long-lived SSE (Server-Sent Events) connections through Cloudflare.
