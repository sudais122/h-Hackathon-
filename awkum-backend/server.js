const express = require('express');
const Datastore = require('nedb-promises');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const app = express();
const saltRounds = 10;

app.use(cors());
app.use(express.json());

// --- 1. DATABASE SETUP ---
const usersDb = Datastore.create({ 
    filename: path.join(__dirname, 'users.db'), 
    autoload: true 
});

const complaintsDb = Datastore.create({ 
    filename: path.join(__dirname, 'complaints.db'), 
    autoload: true 
});

// --- 2. STORAGE ---
const otpStore = {}; 
const passwordResetStore = {}; 

// --- 3. EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'khansb17798@gmail.com', 
        pass: 'dthmlytdvcsnsxgz', 
    }
});

function normalizeEmail(email) {
    return String(email).toLowerCase().trim();
}

// --- ROUTES ---

// 1. SEND REGISTRATION OTP
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email, fullname } = req.body;
        const normalizedEmail = normalizeEmail(email);
        const existingUser = await usersDb.findOne({ email: normalizedEmail });
        if (existingUser) return res.status(400).json({ error: "Email already registered!" });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[normalizedEmail] = { code: code, expires: Date.now() + 5 * 60 * 1000 };

        transporter.sendMail({
            from: '"FixIt Security" <khansb17798@gmail.com>',
            to: normalizedEmail,
            subject: 'Verify Your Email',
            html: `<h2>Your code is: ${code}</h2>`
        }, (err) => {
            if (err) return res.status(500).json({ error: "Email failed" });
            res.json({ message: "OTP Sent" });
        });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 2. REGISTER
app.post('/api/register', async (req, res) => {
    try {
        const { fullname, regNo, department, email, password, otp } = req.body;
        const normalizedEmail = normalizeEmail(email);
        const stored = otpStore[normalizedEmail];

        if (!stored || stored.code !== String(otp).trim()) {
            return res.status(400).json({ error: "Invalid OTP" });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        await usersDb.insert({ 
            fullname, regNo, department, email: normalizedEmail, 
            password: hashedPassword, role: "Student", joined: new Date().toLocaleString() 
        });
        delete otpStore[normalizedEmail];
        res.json({ message: "Success" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 3. LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Basic Validation
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // 2. Consistent Normalization
        const normalizedEmail = email.toLowerCase().trim();
        
        // DEBUG LOG: See what's happening in your terminal
        console.log(`Login attempt for: ${normalizedEmail}`);

        // 3. Find User
        const user = await usersDb.findOne({ email: normalizedEmail });

        if (!user) {
            console.log("Result: User not found in database.");
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // 4. Compare Password
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            console.log("Result: Password does not match.");
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // 5. Success
        console.log(`Result: Success! Logging in ${user.fullname}`);
        res.json({ 
            message: "Login Successful", 
            user: { 
                fullname: user.fullname, 
                regNo: user.regNo, 
                email: user.email 
            } 
        });

    } catch (error) {
        console.error("CRITICAL LOGIN ERROR:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// 4. FORGOT PASSWORD 
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = normalizeEmail(email);
        const user = await usersDb.findOne({ email: normalizedEmail });

        if (!user) return res.status(404).json({ error: "Email not found" });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        passwordResetStore[normalizedEmail] = { code, expires: Date.now() + 10 * 60 * 1000 };

        transporter.sendMail({
            from: '"FixIt Security"',
            to: normalizedEmail,
            subject: 'Password Reset Code',
            html: `<h1>${code}</h1>`
        }, (err) => {
            if (err) return res.status(500).json({ error: "Email failed" });
            res.json({ message: "Reset code sent" });
        });
    } catch (error) { res.status(500).json({ error: "Server Error" }); }
});

// 5. RESET PASSWORD
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        const normalizedEmail = normalizeEmail(email);
        const record = passwordResetStore[normalizedEmail];

        if (!record || record.code !== String(otp).trim()) {
            return res.status(400).json({ error: "Invalid OTP" });
        }

        const hashed = await bcrypt.hash(newPassword, saltRounds);
        await usersDb.update({ email: normalizedEmail }, { $set: { password: hashed } });
        delete passwordResetStore[normalizedEmail];
        res.json({ message: "Password updated" });
    } catch (error) { res.status(500).json({ error: "Server Error" }); }
});

app.get('/api/my-complaints', async (req, res) => {
    try {
        const userEmail = normalizeEmail(req.query.email);
        if (!userEmail) return res.status(400).json({ error: "Email is required" });

        // Find complaints only for this specific user
        const myIssues = await complaintsDb.find({ email: userEmail }).sort({ date: -1 });
        res.json(myIssues);
    } catch (error) { 
        res.status(500).json({ error: "Failed to fetch complaints" }); 
    }
});

// --- UPDATE YOUR COMPLAINT POST ROUTE ---
app.post('/api/report-issue', async (req, res) => {
    try {
        const { fullname, email, category, location, description } = req.body;
        
        const newComplaint = {
            fullname,
            email: normalizeEmail(email),
            category,
            location,
            description,
            status: "Pending",
            date: new Date().toLocaleString(),
            createdAt: Date.now()
        };

        const result = await complaintsDb.insert(newComplaint);
        res.json({ message: "Complaint submitted successfully!", id: result._id });
    } catch (error) {
        res.status(500).json({ error: "Database error" });
    }
});
// --- NEW SUBMIT ROUTE ---
app.post('/api/submit', async (req, res) => {
    try {
        const { fullname, email, regNo, category, location, description } = req.body;

        // Generate Unique 5-Digit ID
        let isUnique = false;
        let complaintId;
        while (!isUnique) {
            complaintId = Math.floor(10000 + Math.random() * 90000).toString();
            const existing = await complaintsDb.findOne({ complaintId: complaintId });
            if (!existing) isUnique = true;
        }

        const newComplaint = {
            complaintId, 
            fullname,
            email: email.toLowerCase().trim(),
            regNo,
            category,
            location,     
            description,
            status: "Pending",
            date: new Date().toISOString(),
            createdAt: Date.now()
        };

        const saved = await complaintsDb.insert(newComplaint);
        console.log(newComplaint);
        res.json({ message: "Success", complaintId: saved.complaintId });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});
app.get('/api/complaints', async (req, res) => {
    try {
        // Fetch all complaints, sorted by newest first
        const complaints = await complaintsDb.find({}).sort({ createdAt: -1 });
        res.json(complaints);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch complaints" });
    }
});

// view and forward route
app.post('/api/forward-complaint', async (req, res) => {
    const { teacherEmail, adminNote, complaintData } = req.body;

    const mailOptions = {
        from: '"FixIt CS-AWKUM" <your-email@gmail.com>',
        to: teacherEmail,
        subject: `URGENT: Faculty Complaint Forwarded [#${complaintData.complaintId}]`,
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #BD2426; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 20px;">FixIt CS-AWKUM Official Notice</h1>
                </div>
                <div style="padding: 25px; color: #334155;">
                    <p>Dear Faculty Member,</p>
                    <p>The following student complaint has been officially forwarded to you by the Department Administration for review and resolution.</p>
                    
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p><strong>Complaint ID:</strong> #${complaintData.complaintId}</p>
                        <p><strong>Issue:</strong> ${complaintData.location}</p>
                        <p><strong>Description:</strong> ${complaintData.description}</p>
                    </div>

                    ${adminNote ? `
                    <div style="border-left: 4px solid #BD2426; padding-left: 15px; margin: 20px 0;">
                        <p><strong>Administrative Note:</strong><br>${adminNote}</p>
                    </div>` : ''}

                    <p style="font-size: 13px; color: #64748b; margin-top: 30px;">
                        Please acknowledge receipt of this complaint and provide an update to the Chairman's office once addressed.
                    </p>
                </div>
            </div>
        `
    };

    transporter.sendMail(mailOptions, (err) => {
        if (err) return res.status(500).json({ error: "Mail delivery failed" });
        complaintsDb.update({ _id: complaintData._id }, { $set: { status: "Forwarded" } });
        res.json({ success: true });
    });
});
// Fetch a single complaint by its Database ID
app.get('/api/complaints/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const complaint = await complaintsDb.findOne({ _id: id });
        if (complaint) {
            res.json(complaint);
        } else {
            res.status(404).json({ error: "Complaint not found" });
        }
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});
// --- ADMIN API ---
app.get('/api/users', async (req, res) => {
    const users = await usersDb.find({ role: "Student" });
    res.json(users);
});

app.listen(3001, () => console.log("🚀 Server at http://localhost:3001"));