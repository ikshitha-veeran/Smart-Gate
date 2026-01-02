# 🛡️ SmartGate - SMVEC Gate Pass System

<div align="center">

![SmartGate Banner](https://img.shields.io/badge/SmartGate-SMVEC-blue?style=for-the-badge&logo=shield&logoColor=white)

[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=flat-square&logo=react&logoColor=white)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)

**A modern, secure, and efficient digital gate pass management system for Sri Manakula Vinayagar Engineering College**

Live demo - https://smart-gate-green.vercel.app/

[Features](#-features) • [Tech Stack](#-tech-stack) • [Installation](#-installation) • [Usage](#-usage) • [API Reference](#-api-reference)

</div>

---

## 📸 Screenshots

<div align="center">
<table>
<tr>
<td align="center"><b>🎓 Student Dashboard</b></td>
<td align="center"><b>👨‍🏫 Advisor Dashboard</b></td>
</tr>
<tr>
<td>Request gate passes & view QR codes</td>
<td>Review and approve student requests</td>
</tr>
</table>
</div>

---

## ✨ Features

### 🔐 Multi-Role Authentication
- **Students** - Register with `@smvec.ac.in` email, request gate passes
- **Class Advisors (CA)** - Review and approve/reject requests from their class
- **Head of Departments (HOD)** - Final approval authority, generates QR codes
- **Security** - Scan and validate QR codes at gates

### 🔄 Smart Approval Workflow
```
Student Request → Class Advisor → HOD → QR Code Generated → Security Scan
```

### 📱 Key Capabilities
| Feature | Description |
|---------|-------------|
| 🎫 **One-Time QR Codes** | Unique UUID tokens that become invalid after use |
| 🔗 **Auto-Assignment** | Students automatically linked to CA/HOD based on dept/year/section |
| 📧 **Domain Validation** | Only `@smvec.ac.in` emails allowed for students |
| 📷 **Camera Scanning** | Security can scan QR codes using device camera |
| 🌙 **Dark Theme UI** | Modern glass-morphism design with animations |
| 📱 **Mobile Responsive** | Works seamlessly on all devices |

---

## 🛠 Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| ![React](https://img.shields.io/badge/-React-61DAFB?style=flat-square&logo=react&logoColor=black) | UI Framework |
| ![Vite](https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=vite&logoColor=white) | Build Tool |
| ![Tailwind](https://img.shields.io/badge/-Tailwind-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white) | Styling |
| ![Framer Motion](https://img.shields.io/badge/-Framer%20Motion-0055FF?style=flat-square&logo=framer&logoColor=white) | Animations |

### Backend
| Technology | Purpose |
|------------|---------|
| ![Node.js](https://img.shields.io/badge/-Node.js-339933?style=flat-square&logo=node.js&logoColor=white) | Runtime |
| ![Express](https://img.shields.io/badge/-Express-000000?style=flat-square&logo=express&logoColor=white) | API Framework |
| ![Firebase](https://img.shields.io/badge/-Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black) | Auth & Database |

---

## 🚀 Installation

### Prerequisites
- Node.js 18.x or higher
- npm or yarn
- Firebase Project with Firestore & Authentication enabled

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/Abinayaravi07/Smart-Gate.git
cd Smart-Gate
```

### 2️⃣ Backend Setup
```bash
cd backend
npm install
```

Create `.env` file in `backend/`:
```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
PORT=5000
ALLOWED_EMAIL_DOMAIN=smvec.ac.in
```

### 3️⃣ Frontend Setup
```bash
cd frontend
npm install
```

Create `.env` file in `frontend/`:
```env
VITE_API_URL=http://localhost:5000/api
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4️⃣ Run the Application
```bash
# Terminal 1 - Backend
cd backend && npm start

# Terminal 2 - Frontend
cd frontend && npm run dev
```

🌐 Open `http://localhost:5173` in your browser

---

## 📖 Usage

### 👨‍🎓 For Students
1. Select **Student** portal on login page
2. Sign in with Google (`@smvec.ac.in` email required)
3. Complete registration with department, year, section
4. Submit gate pass requests with reason and dates
5. View approved QR code in dashboard

### 👨‍🏫 For Class Advisors
1. Login with CA credentials
2. View pending requests from your class
3. Approve or reject with remarks

### 🎓 For HOD
1. Login with HOD credentials
2. Review CA-approved requests
3. Final approval generates QR code for student

### 👮 For Security
1. Login with Security credentials
2. Use camera to scan student QR codes
3. System validates and marks pass as used

---

## 📡 API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register-student` | Register new student |
| `POST` | `/api/auth/validate-role` | Validate user role before login |
| `GET` | `/api/auth/me` | Get current user profile |

### Student
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/student/request` | Create new gate pass request |
| `GET` | `/api/student/requests` | Get student's own requests |

### Advisor
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/advisor/requests` | Get pending requests |
| `POST` | `/api/advisor/approve/:id` | Approve request |
| `POST` | `/api/advisor/reject/:id` | Reject request |

### HOD
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/hod/requests` | Get pending requests |
| `POST` | `/api/hod/approve/:id` | Approve & generate QR |
| `POST` | `/api/hod/reject/:id` | Reject request |

### Security
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/security/verify-qr` | Verify and mark QR as used |
| `GET` | `/api/security/scan-history` | Get scan history |

---

## 🗄️ Database Schema

### Users Collection
```javascript
{
  email: "student@smvec.ac.in",
  name: "John Doe",
  role: "student", // student | advisor | hod | security
  department: "CSE",
  year: "3",
  section: "A",
  assignedAdvisorId: "...",
  assignedHodId: "...",
  firebaseUid: "..."
}
```

### Gate Requests Collection
```javascript
{
  studentId: "...",
  studentName: "John Doe",
  reason: "Medical checkup",
  destination: "Hospital",
  exitDate: "2026-01-15",
  status: "pending_advisor", // pending_advisor | pending_hod | approved | rejected | used
  qrToken: "uuid-token",
  qrUsed: false
}
```

---

## 🌐 Deployment (Vercel)

This project is configured for single-instance deployment on Vercel.

1. Push code to GitHub
2. Import repository in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy! 🚀

---

## 📁 Project Structure

```
smartgate/
├── api/
│   └── index.js          # Vercel serverless entry
├── backend/
│   ├── server.js         # Express API server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Dashboard pages
│   │   ├── context/      # Auth context
│   │   └── config/       # API & Firebase config
│   └── package.json
├── vercel.json           # Vercel configuration
└── package.json          # Root package.json
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

This project is licensed under the MIT License.

---

<div align="center">

**Made with ❤️ for SMVEC**

</div>

