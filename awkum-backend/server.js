const express = require('express');
const Datastore = require('nedb-promises');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const app = express();
const saltRounds = 10;

app.use(express.static(__dirname));
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
            html: `<h2>Your code is: ${code}</h2>`,
            html: `<h2>Your code is: ${code}</h2><p>This code will expire in 5 minutes.</p>`
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

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        console.log(`Login attempt for: ${normalizedEmail}`);

        const user = await usersDb.findOne({ email: normalizedEmail });

        if (!user) {
            console.log("Result: User not found in database.");
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            console.log("Result: Password does not match.");
            return res.status(401).json({ error: "Invalid email or password" });
        }

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
            html: `<h1>${code}</h1>`,
            html :'<h3>This code will be expire in 5 minutes</h3>'
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

        const myIssues = await complaintsDb.find({ email: userEmail }).sort({ date: -1 });
        res.json(myIssues);
    } catch (error) { 
        res.status(500).json({ error: "Failed to fetch complaints" }); 
    }
});

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

app.post('/api/submit', async (req, res) => {
    try {
        const { fullname, email, regNo, category, location, description } = req.body;

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

        transporter.sendMail({
            from: '"FixIt CS-AWKUM" <khansb17798@gmail.com>',
            to:   'sudaismuhammad752@gmail.com',
            subject: 'New Complaint Received [#' + saved.complaintId + '] - ' + newComplaint.category,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #eee; padding: 24px; border-radius: 8px;">
                    <h2 style="color: #BD2426; margin-bottom: 4px;">FixIt CS-AWKUM</h2>
                    <p style="color: #666; margin-bottom: 20px;">A new complaint has been submitted.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin-bottom: 20px;">
                    <p><strong>Complaint ID:</strong> #${saved.complaintId}</p>
                    <p><strong>Category:</strong> ${newComplaint.category}</p>
                    <p><strong>Nature / Location:</strong> ${newComplaint.location || 'N/A'}</p>
                    <p><strong>Description:</strong></p>
                    <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #BD2426; color: #444;">
                        ${newComplaint.description}
                    </div>
                    <p style="margin-top: 20px; color: #999; font-size: 0.85rem;">Submitted at: ${newComplaint.date}</p>
                </div>
            `
        }, (err) => {
            if (err) console.error('Admin notification email failed:', err.message);
            else     console.log('Admin notified for complaint #' + saved.complaintId);
        });

        res.json({ message: "Success", complaintId: saved.complaintId });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/api/complaints', async (req, res) => {
    try {
        const complaints = await complaintsDb.find({}).sort({ createdAt: -1 });
        res.json(complaints);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch complaints" });
    }
});

app.get('/api/complaints/:id', async (req, res) => {
    try {
        const id = req.params.id.trim();
        const complaint = await complaintsDb.findOne({ _id: id });
        if (!complaint) {
            return res.status(404).json({ error: `Complaint with id "${id}" not found` });
        }
        res.json(complaint);
    } catch (error) {
        console.error('❌ Error fetching complaint:', error);
        res.status(500).json({ error: "Failed to fetch complaint" });
    }
});

// FORWARD COMPLAINT
app.post('/api/forward-complaint', async (req, res) => {
    const { id, teacherEmail, adminNote, complaintData } = req.body;

    try {
        await complaintsDb.update(
            { _id: id },
            { $set: { status: "Forwarded", forwardedTo: teacherEmail } }
        );
        console.log('Status updated to Forwarded for complaint: ' + id);
        const replyLink = `http://localhost:3001/faculty-reply.html?id=${id}&email=${encodeURIComponent(teacherEmail)}`;        res.json({ success: true });

        const mailOptions = {
            from: '"FixIt CS-AWKUM" <khansb17798@gmail.com>',
            to: teacherEmail,
            subject: 'URGENT: Faculty Complaint Forwarded [#' + complaintData.complaintId + ']',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #BD2426;">FixIt CS-AWKUM Official Notice</h2>
                    <p>A student complaint has been forwarded to you for resolution.</p>
                    <hr style="border:none; border-top:1px solid #eee;">
                    <p><strong>Complaint ID:</strong> #${complaintData.complaintId}</p>
                    <p><strong>Location/Nature:</strong> ${complaintData.location}</p>
                    <p><strong>Details:</strong> ${complaintData.description}</p>
                    
                    ${adminNote ? `<p style="background:#fdf2f2; padding:10px; border-left:4px solid #BD2426;"><strong>Admin Note:</strong> ${adminNote}</p>` : ''}
                    
                    <div style="margin-top: 30px; text-align: center;">
                        <p style="font-size: 14px; color: #666;">To provide your resolution or update the status, please click the button below:</p>
                        <a href="${replyLink}" 
                           style="background-color: #BD2426; color: white; padding: 14px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                           Submit Resolution Message
                        </a>
                    </div>
                    
                    <p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">
                        This is an automated message from the FixIt CS-AWKUM Portal. Please do not reply directly to this email.
                    </p>
                </div>`
        };

        transporter.sendMail(mailOptions, (err) => {
            if (err) console.error('Email send failed (DB already updated):', err.message);
            else console.log('Email sent to ' + teacherEmail);
        });

    } catch (dbErr) {
        console.error('DB update failed:', dbErr);
        res.status(500).json({ error: "Database update failed" });
    }
});
// Add this new route to your server.js
app.put('/api/complaints/:id/faculty-reply', async (req, res) => {
    const { id } = req.params;
    const { facultyReply } = req.body;

    try {
        await complaintsDb.update(
            { _id: id }, 
            { $set: { facultyReply: facultyReply, status: "Faculty Replied" } }
        );
        console.log('Faculty reply saved for ID: ' + id);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to save reply" });
    }
});
app.put('/api/complaints/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        console.log('Updating complaint ' + id + ' to status: ' + status);

        await complaintsDb.update(
            { _id: id },
            { $set: { status: status } }
        );
        console.log('Status successfully updated to: ' + status);
        res.json({ message: "Status updated successfully" });

    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ error: "Server error" });
    }
});
// POST - Admin sends reply to a complaint
app.post('/api/complaints/:id/reply', async (req, res) => {
    try {
        const { id } = req.params;
        const { adminReply, replyTimestamp } = req.body;

        if (!adminReply || !adminReply.trim()) {
            return res.status(400).json({ error: 'Reply message cannot be empty' });
        }

        const numUpdated = await complaintsDb.update(
            { _id: id }, 
            { 
                $set: { 
                    adminReply: adminReply.trim(),
                    replyTimestamp: replyTimestamp || new Date().toISOString(),
                    status: "Replied" 
                } 
            },
            { returnUpdatedDocs: true }
        );

        if (numUpdated === 0) {
            return res.status(404).json({ error: 'Complaint not found in database' });
        }

        // Fetch the updated document to send back to the frontend
        const updatedComplaint = await complaintsDb.findOne({ _id: id });

        res.status(200).json({
            success: true,
            message: 'Reply saved successfully',
            complaint: updatedComplaint
        });

    } catch (error) {
        console.error('Database Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.get('/api/users', async (req, res) => {
    const users = await usersDb.find({ role: "Student" });
    res.json(users);
});

app.listen(3001, () => console.log("Server at http://localhost:3001"));