const express = require('express');
const Datastore = require('nedb-promises');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// --- 1. DATABASE SETUP ---
const usersDb = Datastore.create({ 
    filename: path.join(__dirname, 'users.db'), 
    autoload: true 
});

const complaintsDb = Datastore.create({ 
    filename: path.join(__dirname, 'complaints.db'), 
    autoload: true 
});

console.log("✅ Local Databases Connected!");

// --- 2. UPLOAD SETUP ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, file.originalname) 
});
const upload = multer({ storage: storage });

// --- 3. OTP STORAGE ---
const otpStore = {}; // For Registration
const passwordResetStore = {}; // For Password Reset

// --- 4. EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'khansb17798@gmail.com', 
        pass: 'gurcekyqlynffxaj', // ⚠️ Make sure this App Password is correct!
    }
});

function normalizeEmail(email) {
    return String(email).toLowerCase().trim();
}

// ==========================================
//                 ROUTES
// ==========================================

// --- 1. SEND REGISTRATION OTP ---
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email, fullname } = req.body;
        const normalizedEmail = normalizeEmail(email);
        
        console.log(`\n🔹 [REGISTRATION] OTP Request for: ${normalizedEmail}`);

        // Check if user already exists
        const existingUser = await usersDb.findOne({ email: normalizedEmail });
        if (existingUser) {
            console.log(`❌ [REGISTRATION] Failed: Email ${normalizedEmail} already exists.`);
            return res.status(400).json({ error: "Email is already registered! Login instead." });
        }

        // Generate Code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save to Store (Expires in 1 Minute)
        otpStore[normalizedEmail] = {
            code: code,
            expires: Date.now() + 1 * 60 * 1000 
        };

        console.log(`   Generated Code: ${code}`);

        const mailOptions = {
            from: '"FixIt Security" <khansb17798@gmail.com>',
            to: normalizedEmail,
            subject: 'Verify Your Email - FixIt AWKUM',
            html: `
                <div style="font-family: Arial; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #BD2426;">Verify Your Email</h2>
                    <p>Hi ${fullname},</p>
                    <p>Use the code below to verify your account:</p>
                    <h1 style="background: #eee; display: inline-block; padding: 10px 20px; letter-spacing: 5px;">${code}</h1>
                    <p><strong>This code expires in 1 minute.</strong></p>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error) => {
            if (error) {
                console.error("❌ [EMAIL ERROR]:", error);
                return res.status(500).json({ error: "Could not send email. Check server console." });
            }
            console.log("✅ [REGISTRATION] Email Sent Successfully");
            res.json({ message: "OTP Sent Successfully" });
        });

    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- 2. FINALIZE REGISTRATION ---
app.post('/api/register', async (req, res) => {
    try {
        const { fullname, regNo, department, email, password, otp } = req.body;
        const normalizedEmail = normalizeEmail(email);
        const normalizedOtp = String(otp).trim();
        
        console.log(`\nFinalizing account for: ${normalizedEmail}`);

        const storedOtpData = otpStore[normalizedEmail];

        // Validation
        if (!storedOtpData) {
            console.log("❌ OTP Not Found (Expired or never requested)");
            return res.status(400).json({ error: "Session expired. Please sign up again." });
        }
        if (Date.now() > storedOtpData.expires) {
            console.log("❌ OTP Expired");
            return res.status(400).json({ error: "OTP has expired." });
        }
        if (storedOtpData.code !== normalizedOtp) {
            console.log(`❌ Invalid OTP. Entered: ${normalizedOtp}, Expected: ${storedOtpData.code}`);
            return res.status(400).json({ error: "Invalid OTP code." });
        }

        // Double check user existence
        const existingUser = await usersDb.findOne({ $or: [{ email: normalizedEmail }, { regNo: regNo }] });
        if (existingUser) {
            console.log("❌ User already in DB");
            return res.status(400).json({ error: "User already exists." });
        }

        // Create User
        const newUser = { 
            fullname, regNo, department, email: normalizedEmail, password, 
            role: "Student", joined: new Date().toLocaleString(), createdAt: Date.now() 
        };
        
        await usersDb.insert(newUser);
        delete otpStore[normalizedEmail]; // Clear OTP

        console.log("Success! New user added to DB.");
        res.json({ message: "Registration Successful!" });
    } catch (error) {
        console.error("❌ Registration Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- 3. LOGIN ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = normalizeEmail(email);
        console.log(`\n🔹 [LOGIN] Attempt for: ${normalizedEmail}`);

        const user = await usersDb.findOne({ email: normalizedEmail, password: password });
        
        if (user) {
            console.log("✅ [LOGIN] Success");
            res.json({ message: "Login Successful", user: user });
        } else {
            console.log("❌ [LOGIN] Failed: Invalid Credentials");
            res.status(401).json({ error: "Invalid Credentials" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- 4. FORGOT PASSWORD REQUEST ---
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = normalizeEmail(email);

        console.log(`\n🔹 [FORGOT PASSWORD] Request for: ${normalizedEmail}`);

        const user = await usersDb.findOne({ email: normalizedEmail });
        if (!user) {
            console.log("❌ Email not found in DB");
            return res.status(404).json({ error: "No account found with this email." });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        passwordResetStore[normalizedEmail] = {
            code: code,
            expires: Date.now() + 1 * 60 * 1000 // 1 Minute
        };

        console.log(`   Generated Reset Code: ${code}`);

        const mailOptions = {
            from: '"FixIt Security" <khansb17798@gmail.com>',
            to: normalizedEmail,
            subject: 'Reset Your Password - FixIt AWKUM',
            html: `
                <div style="font-family: Arial; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #BD2426;">Reset Your Password</h2>
                    <p>Hi ${user.fullname},</p>
                    <p>Use the code below to reset your password:</p>
                    <h1 style="background: #eee; display: inline-block; padding: 10px 20px; letter-spacing: 5px;">${code}</h1>
                    <p><strong>Expires in 1 minute.</strong></p>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error) => {
            if (error) {
                console.error("❌ [EMAIL ERROR]:", error);
                return res.status(500).json({ error: "Failed to send email." });
            }
            console.log("✅ [FORGOT PASSWORD] Email Sent Successfully");
            res.json({ message: "Reset code sent." });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- 5. RESET PASSWORD FINALIZE ---
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        const normalizedEmail = normalizeEmail(email);
        const normalizedOtp = String(otp).trim();

        console.log(`\n🔹 [RESET PASSWORD] Attempt for: ${normalizedEmail}`);

        const record = passwordResetStore[normalizedEmail];

        if (!record) {
            console.log("❌ No reset request found");
            return res.status(400).json({ error: "No reset request found. Try again." });
        }
        if (Date.now() > record.expires) {
            console.log("❌ Reset Code Expired");
            delete passwordResetStore[normalizedEmail];
            return res.status(400).json({ error: "Code expired. Request a new one." });
        }
        if (record.code !== normalizedOtp) {
            console.log("❌ Invalid Reset Code");
            return res.status(400).json({ error: "Invalid Code." });
        }

        // Update Password
        await usersDb.update(
            { email: normalizedEmail }, 
            { $set: { password: newPassword } }
        );

        delete passwordResetStore[normalizedEmail];
        console.log("✅ [RESET PASSWORD] Success! Database updated.");
        res.json({ message: "Password updated successfully!" });

    } catch (error) {
        console.error("Reset Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- 6. OTHER ROUTES (Complaints, Admin) ---

app.post('/api/submit', upload.single('image'), async (req, res) => {
    try {
        const imagePath = req.file ? `http://localhost:3001/uploads/${req.file.filename}` : null;
        const newComplaint = {
            email: normalizeEmail(req.body.email),
            category: req.body.category, location: req.body.location,
            description: req.body.description, imagePath: imagePath, status: "Pending",
            date: new Date().toLocaleString(),
        };
        const doc = await complaintsDb.insert(newComplaint); 
        console.log("✅ New Complaint Submitted");
        res.json({ message: "Complaint Saved!", data: doc });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/my-complaints', async (req, res) => {
    try {
        const userEmail = normalizeEmail(req.query.email);
        const myIssues = await complaintsDb.find({ email: userEmail }).sort({ date: -1 });
        res.json(myIssues);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/complaints', async (req, res) => {
    try {
        const complaints = await complaintsDb.find({}).sort({ date: -1 });
        res.json(complaints);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await usersDb.find({ role: "Student" }).sort({ createdAt: -1 });
        res.json(users);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/update-status', async (req, res) => {
    try {
        const { id, status } = req.body;
        await complaintsDb.update({ _id: id }, { $set: { status: status } });
        console.log(`✅ Status Updated to ${status}`);
        res.json({ message: "Status Updated" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/complaints/:id', async (req, res) => {
    try {
        await complaintsDb.remove({ _id: req.params.id }, {});
        res.json({ message: "Deleted" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await usersDb.remove({ _id: req.params.id }, {});
        res.json({ message: "User Deleted" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/complaints', async (req, res) => {
    try {
        const files = fs.readdirSync(uploadDir);
        for (const file of files) fs.unlinkSync(path.join(uploadDir, file));
        await complaintsDb.remove({}, { multi: true });
        res.json({ message: "All Deleted" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- START SERVER ---
app.listen(3001, () => {
    console.log("🚀 Server running at http://localhost:3001");
});