const express = require('express');
const Datastore = require('nedb-promises'); // Local Database tool
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');

const app = express();

// 1. SETUP
app.use(cors()); // Allow the HTML page to talk to this server
app.use(express.json()); // Allow reading the data sent from the form
app.use('/uploads', express.static('uploads'));

// 2. DATABASES
// Create/Load the 'users.db' file for accounts
const usersDb = Datastore.create({ filename: 'users.db', autoload: true });
// Create/Load the 'complaints.db' file for reports
const complaintsDb = Datastore.create({ filename: 'complaints.db', autoload: true });

console.log("✅ Local Databases Connected!");

// 3. IMAGE STORAGE
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- ROUTES ---

// 1. REGISTER USER (This fixes your error!)
app.post('/api/register', async (req, res) => {
    try {
        console.log("Received Registration Request:", req.body); // Debugging line

        const { fullname, regNo, department, email, password } = req.body;

        // Check if user already exists
        const existingUser = await usersDb.findOne({ $or: [{ email: email }, { regNo: regNo }] });
        if (existingUser) {
            return res.status(400).json({ error: "User with this Email or Reg No already exists." });
        }

        const newUser = {
            fullname,
            regNo,
            department,
            email,
            password, 
            role: "Student",
            joined: new Date()
        };

        await usersDb.insert(newUser);
        res.json({ message: "Registration Successful!" });
        console.log("✅ New User Saved:", fullname);

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 2. GET ALL USERS (For Admin Panel)
app.get('/api/users', async (req, res) => {
    try {
        const users = await usersDb.find({ role: "Student" }).sort({ joined: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. SUBMIT COMPLAINT
app.post('/api/submit', upload.single('image'), async (req, res) => {
    try {
        const imagePath = req.file ? `http://localhost:5000/uploads/${req.file.filename}` : null;
        const newComplaint = {
            category: req.body.category,
            location: req.body.location,
            description: req.body.description,
            imagePath: imagePath,
            status: "Pending",
            date: new Date(),
        };
        const doc = await complaintsDb.insert(newComplaint); 
        res.json({ message: "Saved!", data: doc });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. GET COMPLAINTS
app.get('/api/complaints', async (req, res) => {
    try {
        const complaints = await complaintsDb.find({}).sort({ date: -1 });
        res.json(complaints);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. UPDATE STATUS
app.post('/api/update-status', async (req, res) => {
    try {
        const { id, status } = req.body;
        await complaintsDb.update({ _id: id }, { $set: { status: status } });
        res.json({ message: "Updated" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// START SERVER
app.listen(5000, () => {
    console.log("🚀 Server running at http://localhost:5000");
}); 