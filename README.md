<p align="center">
  <img src="docs/brand/bodhi-icon.png" width="120" alt="BODHI app icon" />
</p>

<h1 align="center">BODHI</h1>

<p align="center">
  <strong>Your Money. Alive.</strong><br />
  <em>The Financial Immune System for Gen-Z</em>
</p>

<p align="center">
  <a href="https://github.com/GovindJindal/BODHI/releases/latest"><img src="https://img.shields.io/badge/Download-Android%20APK-1f6b4a?logo=android&logoColor=white" alt="Download the Android APK" /></a>
  <img src="https://img.shields.io/badge/React%20Native-0.73.4-61DAFB?logo=react&logoColor=black" alt="React Native" />
  <img src="https://img.shields.io/badge/FastAPI-Python%203.11-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/AWS-Lambda-FF9900?logo=amazon-aws&logoColor=white" alt="AWS Lambda" />
  <img src="https://img.shields.io/badge/Payments-Razorpay-008CFF?logo=razorpay&logoColor=white" alt="Razorpay" />
</p>

BODHI is a fintech super app for students and young earners: a wallet with UPI-style transfers and QR pay, shared trip wallets that split and settle expenses, investment clubs that pool money and vote on paper trades, an AI money assistant you can talk to in English, Hindi or Hinglish, and plain-language summaries of insurance policies. Staff run it from the BODHI Admin dashboard.

---

## 📲 Download the Android app

Get the latest **`BODHI-v1.1.apk`** from the [Releases page](https://github.com/GovindJindal/BODHI/releases/latest).

1. Open the APK on your Android phone (Android 5.0 or newer).
2. If asked, allow your browser or file manager to install unknown apps.
3. Open BODHI, sign up with your email, and set your M-PIN (to sign in) and U-PIN (to approve payments).

The app talks to the live BODHI API, so you need an internet connection. To build the APK yourself, see [Build the Android APK](#build-the-android-apk).

---

## ✨ The mobile app

| 🔐 Sign in | 💎 Home | 🎙️ AI assistant |
| :---: | :---: | :---: |
| ![Sign-in screen](docs/screenshots/login.png) | ![Home screen](docs/screenshots/home_screen.png) | ![AI assistant](docs/screenshots/ai_assistant.png) |

| 📜 Insurance stories | 🧮 Calculator | 🔁 Subscriptions |
| :---: | :---: | :---: |
| ![Insurance](docs/screenshots/insurance.png) | ![Calculator](docs/screenshots/calculator.png) | ![Subscriptions](docs/screenshots/subscriptions.png) |

| 🤝 Clubs & ✈️ Trips | 💵 Paper trading | 📈 Market watchlist |
| :---: | :---: | :---: |
| ![Social hub](docs/screenshots/social.png) | ![Paper trading](docs/screenshots/paper_trade.png) | ![Market](docs/screenshots/market.png) |

---

## 🛡️ The admin dashboard

BODHI Admin (`bodhi-admin/`) is where staff watch money move, help members and keep the system healthy. It has light and dark themes and works on a phone.

![BODHI Admin dashboard](docs/screenshots/admin/dashboard.png)

The dashboard opens with **Money movement**: every recent ledger entry is a bar, credits rising in green and debits falling in red. Point at a bar to see who moved how much, and why.

| Members | Member details |
| :---: | :---: |
| ![Members list](docs/screenshots/admin/members.png) | ![Member details drawer](docs/screenshots/admin/member-drawer.png) |
| Search by name, email or phone, filter by role and page through every account. | Wallet activity, paper trades and a confirm-to-suspend button for one member. |

| Ledger | Announcements |
| :---: | :---: |
| ![Ledger](docs/screenshots/admin/ledger.png) | ![Announcements](docs/screenshots/admin/announcements.png) |
| Every credit and debit, exact to the paisa, with copyable references. | Send an in-app notification and see how it will look on a phone first. |

| Trips | Investment clubs |
| :---: | :---: |
| ![Trips](docs/screenshots/admin/trips.png) | ![Investment clubs](docs/screenshots/admin/clubs.png) |

| System status | Audit log |
| :---: | :---: |
| ![System status](docs/screenshots/admin/system.png) | ![Audit log](docs/screenshots/admin/audit.png) |
| Database latency and which integrations are set up. Keys are never shown. | Who suspended whom, who sent what, grouped by day. Super admins only. |

| Dark theme | On a phone | Sign in |
| :---: | :---: | :---: |
| ![Dashboard in dark theme](docs/screenshots/admin/dashboard-dark.png) | ![Dashboard on a phone](docs/screenshots/admin/mobile-dashboard.png) | ![Admin sign-in](docs/screenshots/admin/login.png) |

---

## ⚡ The problem

| Problem | What BODHI does |
| :--- | :--- |
| **Awkward IOUs** ruin trips | Shared **trip wallets** split every expense and work out the fewest payments to settle up |
| **FOMO investing** without understanding risk | **Paper trading** and **investment clubs** to learn with friends before real money |
| **Insurance policies** nobody reads | **Insurance stories** turn a 50-page PDF into the five things that matter |
| **Five apps** for one weekend away | Wallet, splits, trading, travel and an AI assistant in one place |

## 🛠️ Features

- **Wallet and payments**: send money by email, phone or BODHI ID, request money, scan-and-pay with UPI QR codes, and top up through Razorpay. Every payment is confirmed with your U-PIN and written to a double-entry ledger.
- **Trip wallets**: invite friends with a code, log expenses, see who owes whom, chat and run polls inside the trip.
- **Investment clubs**: pool money from members' wallets, propose trades and vote on them; each member's share updates as they contribute.
- **Paper trading**: buy and sell NSE stocks with virtual money at live prices, including after-market orders that fill at the next open.
- **AI assistant (GAP)**: ask about your money or say "I spent ₹500 on Zomato" and it offers to log it. Powered by Google Gemini, with Sarvam AI for Indian-language voice.
- **Insurance stories**: upload a policy PDF and get a plain-language summary.

---

## 🏗️ Architecture

```mermaid
graph TD
    User((Member)) -->|React Native| Mobile[BODHI mobile app]
    Staff((Staff)) -->|Next.js static site| Admin[BODHI Admin]
    Mobile -->|HTTPS + JWT| Gateway[Amazon API Gateway]
    Admin -->|HTTPS + JWT| Gateway
    Gateway -->|Mangum| Lambda[FastAPI on AWS Lambda]
    Lambda -->|SQLAlchemy async| DB[(Neon PostgreSQL)]
    Lambda --> Gemini[Google Gemini]
    Lambda --> Sarvam[Sarvam AI voice]
    Lambda --> Razorpay[Razorpay]
    Lambda --> SMTP[Email OTPs]
```

### Tech stack

| Part | Built with |
| :--- | :--- |
| Mobile app | React Native 0.73, TypeScript, React Navigation, Reanimated, Lucide icons |
| Admin dashboard | Next.js 16 (static export), React 19, Tailwind CSS 4 |
| Backend | FastAPI, SQLAlchemy (async) on PostgreSQL, slowapi rate limiting, deployed to AWS Lambda with SAM |
| AI | Google Gemini (intent and coaching), Sarvam AI (speech to text and text to speech) |
| Payments | Razorpay orders, signature checks and webhooks |

### Project structure

```text
BODHI/
├── mobileApp_BODHI/   React Native app (src/api, src/screens, src/navigation …)
├── bodhi-admin/       Next.js admin dashboard (src/app pages, src/components)
├── bodhi-backend/     FastAPI backend
│   ├── routers/       auth, transfers, social, trade, ai, admin_prod (/admin-v2) …
│   ├── services/      auth, payments, trading, AI, scheduler
│   ├── models/        SQLAlchemy models
│   ├── tests/         integration tests (pytest + PostgreSQL)
│   └── template.yaml  AWS SAM template
└── docs/              screenshots and brand assets
```

---

## 📡 API

**Base URL:** `https://l6927740gk.execute-api.ap-southeast-1.amazonaws.com` · interactive docs at [`/docs`](https://l6927740gk.execute-api.ap-southeast-1.amazonaws.com/docs)

| Area | Endpoint | What it does |
| :--- | :--- | :--- |
| Sign-up | `POST /auth/send-register-otp` → `/auth/verify-register-otp` → `/auth/register` | Email code, then create the account with M-PIN and U-PIN |
| Sign-in | `POST /auth/token`, `POST /auth/refresh` | Get and rotate access and refresh tokens |
| Forgot M-PIN | `POST /auth/forgot-password`, `POST /auth/reset-password` | Email a reset code, then set a new M-PIN |
| Wallet | `POST /transfers/send`, `POST /transfers/qr-pay`, `GET /transfers/history` | Send money, pay a QR code, list transactions |
| Top-up | `POST /transfers/razorpay/create-order`, `/transfers/razorpay/verify-and-credit` | Add money through Razorpay |
| Trips | `GET/POST /social/trips`, `POST /social/trips/{id}/expenses`, `GET /social/trips/{id}/settle` | Trip wallets, expenses and settlement |
| Clubs | `GET/POST /social/investments`, `POST /social/investments/{id}/contribute` | Investment clubs |
| Trading | `GET /trade/portfolio`, `POST /trade/buy`, `POST /trade/sell` | Paper trading |
| AI | `POST /ai/chat`, `POST /ai/command` | Text or voice to an answer, with any detected expense |
| Admin | `/admin-v2/*` | Everything the admin dashboard uses (admin roles only) |

---

## ⚙️ Run it yourself

You need Node.js 18+, Python 3.11+ and PostgreSQL. For Android builds you also need JDK 17 and the Android SDK; for iOS, Xcode and CocoaPods.

### Backend

```bash
cd bodhi-backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # then fill in DATABASE_URL, SECRET_KEY, Razorpay, SMTP and AI keys
uvicorn main:app --reload --port 8000
```

Tables are created on first start. Integrations without keys (email, Gemini, Sarvam, flight search) return a clear "not configured" error instead of crashing; the admin dashboard's **System status** page shows which are missing.

### Admin dashboard

```bash
cd bodhi-admin
npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev
```

Add `http://localhost:3000` to the backend's `ALLOWED_ORIGINS`. See [bodhi-admin/README.md](bodhi-admin/README.md) for creating the first admin and deploying the static build.

### Mobile app

```bash
cd mobileApp_BODHI
npm install --legacy-peer-deps
npm start            # Metro bundler
npm run android      # or: npm run ios (after cd ios && pod install)
```

The app points at the deployed API (`src/api/client.ts`).

### Build the Android APK

```bash
cd mobileApp_BODHI
npm run build:apk
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. It is signed with the project's debug keystore, which is fine for sharing on GitHub but not for the Play Store. For Play Store uploads, create your own release keystore and point `signingConfigs.release` in `android/app/build.gradle` at it.

### Deploy the backend

```bash
cd bodhi-backend
sam build && sam deploy
```

Set `DATABASE_URL`, `SECRET_KEY`, the Razorpay keys, `GEMINI_API_KEY` and `SARVAM_API_KEY` on the Lambda function (or in AWS Secrets Manager); they are not in `template.yaml`.

---

## ✅ Tests

The backend has integration tests that run against a real PostgreSQL database named `bodhi_test` (tables are dropped first, so never point it at real data):

```bash
cd bodhi-backend
export DATABASE_URL=postgresql+asyncpg://postgres@127.0.0.1:5432/bodhi_test
export SECRET_KEY=$(python -c "import secrets;print(secrets.token_hex(32))")
export RAZORPAY_KEY_ID=rzp_test_x RAZORPAY_KEY_SECRET=x RAZORPAY_WEBHOOK_SECRET=x CRON_SECRET=x
pytest -q
```

They cover sign-up, sign-in, forgot M-PIN, Google sign-in, transfers (including concurrent ones), payment requests, QR pay, Razorpay top-ups, trips, clubs, paper trading, the AI assistant, account deletion and the admin API.

---

## 🔒 Security

- M-PIN and U-PIN are hashed; payments check the U-PIN on the server.
- Sign-in uses JWT access tokens with rotating refresh tokens; signing out ends that session, and resetting the M-PIN ends every session.
- Sign-in, OTP and reset endpoints are rate-limited, and OTPs expire after 10 minutes and five wrong tries.
- Wallet balances are updated under row locks, so simultaneous payments can't lose money.
- Card and UPI details stay with Razorpay; BODHI never stores them.

---

## 🗺️ Roadmap

- [x] Wallet, transfers and QR payments with Razorpay
- [x] AI voice logging and Indian-language speech
- [x] Investment clubs and trip wallets
- [x] Admin dashboard with audit log
- [ ] Account Aggregator (open banking) integration
- [ ] Spending and savings forecasts

---

## 👥 The team

**Team BUGHACKERS 404**
- **Govind Jindal**: full-stack architecture and integration
- **Aaradhya Khanna**: AI strategy and RAG
- **Piyush Sharma**: security, notifications and core logic

Built for the **FINVASIA Innovation Hackathon 2026**.

<p align="center"><em>BODHI: your money, alive.</em></p>
