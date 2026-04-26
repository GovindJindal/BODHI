# BODHI Admin Command Center (V2)

Production-ready administrative interface for the BODHI Fintech Super App.

## 🚀 Features
- **Modern UI**: Next.js 14, Tailwind CSS, and Recharts.
- **RBAC**: Multi-role support (Super Admin, Admin, Support).
- **Hardened Security**: JWT-based authentication with isolated admin passwords.
- **Audit Logging**: Every administrative action is logged for compliance.
- **Live Telemetry**: Real-time stats on volume, users, and system health.
- **Feature Monitoring**: View Trip Wallets, Venture Clubs, and AI usage.

## 🛠️ Setup Instructions

### 1. Environment Configuration
Create a `.env.local` file in this directory:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/admin-v2
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
npm start
```

## 🔐 Security Note
This interface connects to the modern `/admin-v2` backend endpoints. Ensure your backend is running the latest `admin_prod.py` router.
