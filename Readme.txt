# 🏛️ FixIt AWKUM - Campus Complaint Portal

**FixIt AWKUM** is a web-based student grievance redressal system designed for Abdul Wali Khan University Mardan (AWKUM). It bridges the gap between students and administration by allowing students to report infrastructure, transport, and academic issues digitally.

The project features a **Student Portal** with an AI-simulated Chatbot and a comprehensive **Admin Dashboard** for managing reports.

---

## 🚀 Features

### 🎓 Student Portal (`index.html`)
* **Issue Reporting:** Students can submit complaints regarding Transport, Hostels, Academics, Cafeteria, etc.
* **Live Feed:** View recent complaints submitted by other students.
* **Responsive Design:** Works smoothly on mobile and desktop.
* **Dark Mode:** Toggle between Light and Dark themes.

### 🛠️ Admin Dashboard (`admin.html`)
* **Statistics Overview:** Real-time counters for Total, Pending, and Resolved issues.
* **Issue Management:** View all student complaints in a table format.
* **Action System:** Mark issues as "Resolved" with a single click.
* **Data Persistence:** Uses **LocalStorage** to save data (no database required for demonstration).
* **Student Database:** View registered students and their hashed passwords.
* **Sidebar Navigation:** Switch between Dashboard, Resolved Issues, and Student Users.

---

## 📂 Project Structure

```text
FixIt-AWKUM/
│
├── index.html          # Student Landing Page (Reporting Form + Chatbot)
├── admin.html          # Admin Dashboard (Stats + Management)
├── login.html          # User Login Page
├── signup.html         # User Registration Page
├── style.css           # (Optional) Global Styles
├── admin-style.css     # (Optional) Admin Specific Styles
└── README.md           # Documentation