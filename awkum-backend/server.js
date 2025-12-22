const express = require('express');
const Datastore = require('nedb-promises');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// --- 1. FIXED DATABASE SETUP ---
const usersDb = Datastore.create({ 
    filename: path.join(__dirname, 'users.db'), 
    autoload: true 
});

const complaintsDb = Datastore.create({ 
    filename: path.join(__dirname, 'complaints.db'), 
    autoload: true 
});

console.log("✅ Local Databases Connected inside Backend folder!");

// --- 2. UPLOAD SETUP ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, file.originalname) 
});
const upload = multer({ storage: storage });

// --- ROUTES ---

// REGISTER
app.post('/api/register', async (req, res) => {
    try {
        const { fullname, regNo, department, email, password } = req.body;
        
        const existingUser = await usersDb.findOne({ $or: [{ email: email }, { regNo: regNo }] });
        if (existingUser) return res.status(400).json({ error: "User already exists." });

        const newUser = { 
            fullname, 
            regNo, 
            department, 
            email, 
            password, 
            role: "Student", 
            // Keep the readable date for display
            joined: new Date().toLocaleString(),
            // ADD THIS: Computer time for perfect sorting
            createdAt: Date.now() 
        };
        
        await usersDb.insert(newUser);
        res.json({ message: "Registration Successful!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await usersDb.findOne({ email: email, password: password });
        
        if (user) {
            res.json({ message: "Login Successful", user: user });
        } else {
            res.status(401).json({ error: "Invalid Credentials" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// SUBMIT COMPLAINT
app.post('/api/submit', upload.single('image'), async (req, res) => {
    try {
        const imagePath = req.file ? `http://localhost:3001/uploads/${req.file.filename}` : null;
        
        const newComplaint = {
            email: req.body.email,
            category: req.body.category,
            location: req.body.location,
            description: req.body.description,
            imagePath: imagePath,
            status: "Pending",
            date: new Date().toLocaleString(),
        };
        const doc = await complaintsDb.insert(newComplaint); 
        res.json({ message: "Saved!", data: doc });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET MY COMPLAINTS
app.get('/api/my-complaints', async (req, res) => {
    try {
        const userEmail = req.query.email;
        const myIssues = await complaintsDb.find({ email: userEmail }).sort({ date: -1 });
        res.json(myIssues);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET ALL COMPLAINTS (Admin)
app.get('/api/complaints', async (req, res) => {
    try {
        const complaints = await complaintsDb.find({}).sort({ date: -1 });
        res.json(complaints);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// GET ALL USERS 
app.get('/api/users', async (req, res) => {
    try {
        const users = await usersDb.find({ role: "Student" }).sort({ createdAt: -1 });
        res.json(users);
    } catch (error) { res.status(500).json({ error: error.message }); }
});
// UPDATE STATUS (Admin)
app.post('/api/update-status', async (req, res) => {
    try {
        const { id, status } = req.body;
        await complaintsDb.update({ _id: id }, { $set: { status: status } });
        res.json({ message: "Updated" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// DELETE SINGLE COMPLAINT & REMOVE FILE
app.delete('/api/complaints/:id', async (req, res) => {
    try {
        const complaintId = req.params.id;
        const complaint = await complaintsDb.findOne({ _id: complaintId });
        
        if (!complaint) return res.status(404).json({ error: "Complaint not found" });

        if (complaint.imagePath) {
            const fileName = complaint.imagePath.split('/').pop();
            const filePath = path.join(__dirname, 'uploads', fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Deleted file: ${fileName}`);
            }
        }

        await complaintsDb.remove({ _id: complaintId }, {});
        res.json({ message: "Complaint deleted" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE SINGLE USER
app.delete('/api/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const numRemoved = await usersDb.remove({ _id: userId }, {});
        if (numRemoved === 0) return res.status(404).json({ error: "User not found" });
        res.json({ message: "User Deleted Successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3001, () => {
    console.log("🚀 Server running at http://localhost:3001");
});