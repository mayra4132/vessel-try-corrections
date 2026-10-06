# VIGOR Smart Port Operations Management System
### Enterprise Fleet Logistics, Berth Intelligence & Decision Support
**Turkys Group of Companies · VIGOR Cement Works (Zanzibar Port, Berth B01)**

---

## 1. System Overview

The **VIGOR Smart Port Operations System** is a mission-critical web application purpose-engineered for **VIGOR Cement Works** to manage and coordinate bulk cement vessel traffic between mainland manufacturing plants (**Tanga Cement**, **Twiga Cement** in Dar es Salaam) and the dedicated **Berth B01** unloader at Zanzibar Port.

This application has been upgraded from a prototype into a **submission-ready enterprise management system** ready for immediate handover to the **Turkys Group IT Directorate**:

- **Frontend / Application Delivery:** Engineered for **Vercel** with global low-latency CDN, modern responsive UI, and instant operational telemetry.
- **Database Engine:** Direct integration with **cPanel MySQL** via connection pooling, full 10-table relational schema (`/database/schema.sql`), and automatic in-memory fallback.
- **Enterprise Authentication:** Strict corporate domain enforcement (`@turkysgroup.co.tz`) with 4-tier Role-Based Access Control (`Admin`, `Management`, `Operations`, `Viewer`).
- **Grounded AI Operations Assistant:** Server-side Google Gemini decision intelligence grounded in real-time port telemetry with interactive action buttons.
- **Tamper-Evident Audit Trail:** Comprehensive activity logging tracking all rate submissions, delay logs, user updates, and payment clearances.

---

## 2. Evaluation & Demo Credentials

Pre-configured staff accounts are ready for executive review:

| Email Address | Role | Department | Password |
| :--- | :--- | :--- | :--- |
| `admin@turkysgroup.co.tz` | **Admin** | Executive & IT | `Turkys@2025` |
| `ceo@turkysgroup.co.tz` | **Management** | Commercial & Executive | `Turkys@2025` |
| `ops.dispatcher@turkysgroup.co.tz` | **Operations** | Terminal Operations | `Turkys@2025` |
| `auditor@turkysgroup.co.tz` | **Viewer** | Finance & Audit | `Turkys@2025` |

> *Evaluator Tip:* A quick role switcher is also available directly inside the sidebar footer for rapid RBAC testing during demonstrations.

---

## 3. Core Business & Engineering Rules

### A. Berth B01 Pneumatic Discharge & Buffer Calculation
* Monitors pneumatic discharge compressor lines (MT/h) for `MV VIGOR 01`.
* Automatically calculates expected berth release time incorporating the **1.5-hour post-unload buffer** required for pneumatic line purge, manifold disconnection, and pilot clearance.
* Equation:  
  $$\text{Release Time} = \text{Current Time} + \left(\frac{\text{Remaining Cargo}}{\text{Discharge Rate}}\right) + 1.5\text{h}$$

### B. Berth Conflict Detection & Eco-Steaming
* Detects when inbound vessels (e.g. `MV VIGOR 03` returning from Tanga) face anchorage idle time due to Berth B01 occupancy.
* Computes real-time **Eco-Steaming speed adjustments** (e.g. throttling from 11.2 kts to 8.5 kts), synchronizing arrival with berth release while saving ~1.8 MT of bunker fuel.

### C. Manufacturer Commercial Payment Gate
* Enforces the **100% advance wire payment clearance rule** before Tanga Cement or Twiga Cement allocates a confirmed vessel loading slot.
* Real-time balance tracking with one-click payment entry recording wire transaction numbers to the audit log.

---

## 4. Deployment Guides

Comprehensive step-by-step manuals are included in the repository:

1. [**cPanel MySQL Database Setup Guide**](CPANEL_DATABASE_SETUP.md)  
   Complete walkthrough for IT administrators to create MySQL databases, grant user privileges, configure Remote MySQL, and import `database/schema.sql` and `database/demo_seed.sql`.

2. [**Vercel Production Deployment Guide**](VERCEL_DEPLOYMENT.md)  
   Step-by-step procedure for importing the repository into Vercel, adding environment variables, and configuring custom corporate domains (`port.turkysgroup.co.tz`).

3. [**Technical Architecture Specifications**](docs/ARCHITECTURE.md)  
   In-depth documentation of subsystems, network topologies, RBAC permissions matrix, and database resilience mechanisms.

4. [**Management & IT Handover Document**](docs/HANDOVER.md)  
   Formal transfer report and release notes for Turkys Group executive management.

---

## Database persistence

The operational API now saves to the relational MySQL/MariaDB tables. See [Database integration and local setup](docs/DATABASE_INTEGRATION.md) for configuration, explicit demo initialization, and restart/concurrency tests. Use `.env` for server credentials. Do not use the legacy `database/demo_seed.sql` with the new schema.

## 5. Local Development Setup

### Prerequisites
* Node.js 18+ & npm

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local

# 3. Start local server (Express + Vite)
npm run dev
```

The application will be accessible at `http://localhost:3000`.

### Environment Configuration (.env)
```ini
# cPanel MySQL Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=cpaneluser_vigor_user
DB_PASSWORD=YourSecurePassword
DB_NAME=cpaneluser_vigor_port

# Security & Authentication
SESSION_SECRET=your_production_secret_key_here

# Operations Intelligence Assistant
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 6. Project Directory Map

```
├── CPANEL_DATABASE_SETUP.md    # cPanel MySQL setup manual
├── VERCEL_DEPLOYMENT.md        # Vercel deployment guide
├── vercel.json                 # Vercel Edge & Serverless routing configuration
├── database/
│   ├── schema.sql              # MySQL DDL (10 relational tables, indexes, FKs)
│   └── demo_seed.sql           # Production baseline seed data
├── docs/
│   ├── ARCHITECTURE.md         # Technical architecture specification
│   └── HANDOVER.md             # Formal management handover document
├── server.ts                   # Express server & API endpoints
├── server/
│   ├── auth.ts                 # Corporate auth, bcrypt hashing & JWT verification
│   └── database.ts             # cPanel MySQL pool & resilience cache manager
├── src/
│   ├── auth/
│   │   └── AuthContext.tsx     # Client auth state & role-based helpers
│   ├── components/             # Reusable UI components & TopBar/Sidebar
│   └── pages/                  # Terminal views (Dashboard, Berths, Admin, etc.)
└── .env.example                # Environment variables template
```

---
© 2026 Turkys Group of Companies · VIGOR Cement Works · All Rights Reserved.
