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

console.log("Local Databases Connected inside Backend folder!");

// --- 2. UPLOAD SETUP ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, file.originalname) 
});
const upload = multer({ storage: storage });

// --- 3. OTP SYSTEM (WITH EXPIRATION) ---
// Stores: { "email@gmail.com": { code: "123456", expires: timestamp } }
const otpStore = {};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'khansb17798@gmail.com', 
        pass: 'gurcekyqlynffxaj',
    }
});

// --- HELPER FUNCTION ---
function normalizeEmail(email) {
    return email.toLowerCase().trim();
}

// --- ROUTES ---

// 1. SEND OTP ROUTE
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email, fullname } = req.body;
        const normalizedEmail = normalizeEmail(email);
        
        console.log(`🔹 Sending OTP to: ${normalizedEmail}`);

        // Check if user exists
        const existingUser = await usersDb.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ error: "Email is already registered!" });
        }

        // Generate 6-digit Code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save Code with Expiration (10 minutes)
        otpStore[normalizedEmail] = {
            code: code,
            expires: Date.now() + 1 * 60 * 1000
        };
        
        console.log(`Code Saved: ${code} (expires in 1 min)`);

        // Send Email
        const mailOptions = {
            from: '"FixIt Security" <khansb17798@gmail.com>',
            to: normalizedEmail,
            subject: 'Your Verification Code - FixIt AWKUM',
            html: `
                <div style="font-family: Arial; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #BD2426;">Verify Your Email</h2>
                    <p>Hi ${fullname},</p>
                    <p>Use the code below to verify your account:</p>
                    <h1 style="background: #eee; display: inline-block; padding: 10px 20px; letter-spacing: 5px;">${code}</h1>
                    <p><strong>This code expires in 1 minutes.</strong></p>
                    <p>If you didn't request this, ignore this email.</p>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Error sending OTP:', error); 
                return res.status(500).json({ error: "Could not send email. Check internet connection." });
            }
            console.log('Email sent successfully');
            res.json({ message: "OTP Sent Successfully" });
        });

    } catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. REGISTER ROUTE (FIXED WITH BETTER VALIDATION)
app.post('/api/register', async (req, res) => {
    try {
        const { fullname, regNo, department, email, password, otp } = req.body;
        const normalizedEmail = normalizeEmail(email);
        const normalizedOtp = String(otp).trim();
        
        console.log("================================================");
        console.log("🔍 REGISTRATION ATTEMPT:");
        console.log("1. Email:", normalizedEmail);
        console.log("2. OTP Entered:", normalizedOtp);
        console.log("3. Stored OTP Data:", otpStore[normalizedEmail]);
        console.log("4. Current Time:", Date.now());
        console.log("================================================");

        // A. Check if OTP exists
        const storedOtpData = otpStore[normalizedEmail];
        if (!storedOtpData) {
            console.log("❌ No OTP found for this email");
            return res.status(400).json({ 
                error: "No OTP found. Please request a new verification code." 
            });
        }

        // B. Check if OTP expired
        if (Date.now() > storedOtpData.expires) {
            delete otpStore[normalizedEmail];
            console.log("OTP expired");
            return res.status(400).json({ 
                error: "OTP expired. Please request a new verification code." 
            });
        }

        // C. Verify OTP
        if (storedOtpData.code !== normalizedOtp) {
            console.log("OTP mismatch");
            console.log(`Expected: "${storedOtpData.code}"`);
            console.log(`Received: "${normalizedOtp}"`);
            return res.status(400).json({ 
                error: "Invalid OTP. Please check and try again." 
            });
        }

        // D. Check if user already exists
        const existingUser = await usersDb.findOne({ 
            $or: [
                { email: normalizedEmail }, 
                { regNo: regNo }
            ] 
        });
        
        if (existingUser) {
            console.log("User already exists");
            return res.status(400).json({ 
                error: "User with this email or registration number already exists." 
            });
        }

        // E. Create User
        const newUser = { 
            fullname, 
            regNo, 
            department, 
            email: normalizedEmail, 
            password, 
            role: "Student", 
            joined: new Date().toLocaleString(),
            createdAt: Date.now() 
        };
        
        await usersDb.insert(newUser);

        // F. Clear OTP after successful registration
        delete otpStore[normalizedEmail];
        
        console.log("✅ USER REGISTERED SUCCESSFULLY!");
        console.log("================================================");

        res.json({ message: "Registration Successful!" });
        
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 3. LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = normalizeEmail(email);
        
        const user = await usersDb.findOne({ 
            email: normalizedEmail, 
            password: password 
        });
        
        if (user) {
            console.log(`Login successful: ${normalizedEmail}`);
            res.json({ message: "Login Successful", user: user });
        } else {
            console.log(`Login failed: ${normalizedEmail}`);
            res.status(401).json({ error: "Invalid Credentials" });
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. SUBMIT COMPLAINT
app.post('/api/submit', upload.single('image'), async (req, res) => {
    try {
        const imagePath = req.file ? `http://localhost:3001/uploads/${req.file.filename}` : null;
        
        const newComplaint = {
            email: normalizeEmail(req.body.email),
            category: req.body.category,
            location: req.body.location,
            description: req.body.description,
            imagePath: imagePath,
            status: "Pending",
            date: new Date().toLocaleString(),
        };
        
        const doc = await complaintsDb.insert(newComplaint); 
        console.log('Complaint submitted');
        res.json({ message: "Complaint Saved!", data: doc });
    } catch (error) {
        console.error('Submit Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. GET MY COMPLAINTS
app.get('/api/my-complaints', async (req, res) => {
    try {
        const userEmail = normalizeEmail(req.query.email);
        const myIssues = await complaintsDb.find({ email: userEmail }).sort({ date: -1 });
        res.json(myIssues);
    } catch (error) {
        console.error('Get Complaints Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. GET ALL COMPLAINTS (Admin)
app.get('/api/complaints', async (req, res) => {
    try {
        const complaints = await complaintsDb.find({}).sort({ date: -1 });
        res.json(complaints);
    } catch (error) {
        console.error('Get All Complaints Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 7. GET ALL USERS (Admin)
app.get('/api/users', async (req, res) => {
    try {
        const users = await usersDb.find({ role: "Student" }).sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        console.error('Get Users Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 8. UPDATE STATUS (Admin)
app.post('/api/update-status', async (req, res) => {
    try {
        const { id, status } = req.body;
        await complaintsDb.update({ _id: id }, { $set: { status: status } });
        console.log(`Status updated for complaint ${id}`);
        res.json({ message: "Status Updated" });
    } catch (error) {
        console.error('Update Status Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 9. DELETE SINGLE COMPLAINT
app.delete('/api/complaints/:id', async (req, res) => {
    try {
        const complaintId = req.params.id;
        const complaint = await complaintsDb.findOne({ _id: complaintId });
        
        if (!complaint) {
            return res.status(404).json({ error: "Complaint not found" });
        }

        // Delete associated image if exists
        if (complaint.imagePath) {
            const fileName = complaint.imagePath.split('/').pop();
            const filePath = path.join(__dirname, 'uploads', fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Deleted file: ${fileName}`);
            }
        }

        await complaintsDb.remove({ _id: complaintId }, {});
        console.log(`Complaint deleted: ${complaintId}`);
        res.json({ message: "Complaint deleted successfully" });

    } catch (error) {
        console.error('Delete Complaint Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 10. DELETE SINGLE USER
app.delete('/api/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const numRemoved = await usersDb.remove({ _id: userId }, {});
        
        if (numRemoved === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        
        console.log(`User deleted: ${userId}`);
        res.json({ message: "User Deleted Successfully" });
    } catch (error) {
        console.error('Delete User Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 11. DELETE ALL COMPLAINTS (Admin)
app.delete('/api/complaints', async (req, res) => {
    try {
        // Delete all uploaded files
        const files = fs.readdirSync(uploadDir);
        for (const file of files) {
            fs.unlinkSync(path.join(uploadDir, file));
        }
        
        // Delete all complaints from database
        await complaintsDb.remove({}, { multi: true });
        
        console.log('All complaints deleted');
        res.json({ message: "All Complaints Deleted Successfully" });
    } catch (error) {
        console.error('Delete All Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 12. RESEND OTP (Optional - Good to have)
app.post('/api/resend-otp', async (req, res) => {
    try {
        const { email, fullname } = req.body;
        const normalizedEmail = normalizeEmail(email);
        
        console.log(`Resending OTP to: ${normalizedEmail}`);

        // Generate new code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Update stored OTP
        otpStore[normalizedEmail] = {
            code: code,
            expires: Date.now() + 10 * 60 * 1000
        };
        
        console.log(`New Code: ${code}`);

        // Send Email
        const mailOptions = {
            from: '"FixIt Security" <khansb17798@gmail.com>',
            to: normalizedEmail,
            subject: 'Your New Verification Code - FixIt AWKUM',
            html: `
                <div style="font-family: Arial; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #BD2426;">New Verification Code</h2>
                    <p>Hi ${fullname},</p>
                    <p>Here's your new verification code:</p>
                    <h1 style="background: #eee; display: inline-block; padding: 10px 20px; letter-spacing: 5px;">${code}</h1>
                    <p><strong>This code expires in 10 minutes.</strong></p>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error) => {
            if (error) {
                console.log('Error resending OTP:', error);
                return res.status(500).json({ error: "Could not resend email." });
            }
            res.json({ message: "New OTP Sent Successfully" });
        });

    } catch (error) {
        console.error('Resend OTP Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- START SERVER ---
app.listen(3001, () => {
    console.log("Server running at http://localhost:3001");
    console.log("OTP System Active");
    console.log("Database Ready");
});