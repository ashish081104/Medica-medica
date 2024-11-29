require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const path = require('path');
const app = express();

// Middleware
app.use(cors());  // Allow all origins for now
app.use(express.json());
app.use(express.static('public'));

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve signup page
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Serve dashboard (protected route)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// In-memory storage
const db = {
    users: [
        {
            id: 1,
            fullname: 'Admin User',
            email: 'admin@medica.com',
            password: '$2a$10$FxwBqjU0WH5KJT7dXqN1q.YG.YG9Q8J6Q8Q8J6Q8Q8J6Q8Q8J6Q8Q',
            role: 'admin'
        }
    ],
    beds: [],
    patients: [],
    doctors: [
        { id: 1, name: 'Dr. Smith', specialization: 'General Medicine', schedule: 'Morning', status: 'active' },
        { id: 2, name: 'Dr. Brown', specialization: 'Pediatrics', schedule: 'Evening', status: 'active' },
        { id: 3, name: 'Dr. Lee', specialization: 'Cardiology', schedule: 'Morning', status: 'active' }
    ],
    appointments: [],
    admissions: []
};

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Login validation
const loginValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
];

// Registration validation
const registerValidation = [
    body('fullname').trim().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['admin', 'doctor', 'nurse', 'staff'])
];

// Login endpoint
app.post('/api/login', loginValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    
    try {
        const user = db.users.find(u => u.email === email);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                fullname: user.fullname,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Register endpoint
app.post('/api/register', registerValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { fullname, email, password, role } = req.body;

    try {
        if (db.users.some(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: db.users.length + 1,
            fullname,
            email,
            password: hashedPassword,
            role
        };
        
        db.users.push(newUser);
        res.json({ success: true, message: 'Registration successful' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all beds status
app.get('/api/beds', authenticateToken, (req, res) => {
    res.json(db.beds);
});

// Get all OPD appointments
app.get('/api/opd-appointments', authenticateToken, (req, res) => {
    res.json(db.appointments);
});

// Get all patients
app.get('/api/patients', authenticateToken, (req, res) => {
    res.json(db.patients);
});

// Get patient by id
app.get('/api/patients/:id', authenticateToken, (req, res) => {
    const patientId = parseInt(req.params.id);
    const patient = db.patients.find(p => p.id === patientId);
    if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
    }
    res.json(patient);
});

// Add new patient
app.post('/api/patients', authenticateToken, (req, res) => {
    const { name, age, gender, blood_group, contact, email, address, emergency_contact } = req.body;
    const newPatient = {
        id: db.patients.length + 1,
        name,
        age,
        gender,
        blood_group,
        contact,
        email,
        address,
        emergency_contact,
        created_at: new Date().toISOString()
    };
    
    db.patients.push(newPatient);
    res.json({ success: true, id: newPatient.id });
});

// Add new appointment
app.post('/api/appointments', authenticateToken, [
    body('patientName').trim().notEmpty(),
    body('doctorId').isNumeric(),
    body('appointmentDate').isDate(),
    body('appointmentTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('notes').optional().trim()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { patientName, doctorId, appointmentDate, appointmentTime, notes } = req.body;
    
    // Find doctor
    const doctor = db.doctors.find(d => d.id === parseInt(doctorId));
    if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found' });
    }

    // Create appointment
    const appointment = {
        id: Date.now(),
        patientName,
        doctorId: parseInt(doctorId),
        doctorName: doctor.name,
        date: appointmentDate,
        time: appointmentTime,
        notes,
        status: 'scheduled',
        createdAt: new Date().toISOString()
    };

    // Add to appointments
    db.appointments.push(appointment);

    // Check if patient exists, if not create new patient
    if (!db.patients.some(p => p.name === patientName)) {
        db.patients.push({
            id: Date.now(),
            name: patientName,
            dateAdded: new Date().toISOString()
        });
    }

    res.status(201).json(appointment);
});

// Get all appointments
app.get('/api/appointments', authenticateToken, (req, res) => {
    res.json(db.appointments);
});

// Get appointment count
app.get('/api/stats', authenticateToken, (req, res) => {
    const stats = {
        appointments: db.appointments.length,
        patients: db.patients.length,
        doctors: db.doctors.length,
        availableBeds: db.beds.filter(bed => bed.status !== 'occupied').length
    };
    res.json(stats);
});

// Get all doctors
app.get('/api/doctors', authenticateToken, (req, res) => {
    res.json(db.doctors);
});

// Add new admission
app.post('/api/admissions', authenticateToken, (req, res) => {
    const { patient_id, bed_id, doctor_id, diagnosis, treatment_plan } = req.body;

    // Check if bed exists and is available
    const bed = db.beds.find(b => b.id === bed_id);
    if (!bed || bed.status !== 'available') {
        return res.status(400).json({ error: 'Bed not available' });
    }

    // Create admission
    const newAdmission = {
        id: db.admissions.length + 1,
        patient_id,
        bed_id,
        doctor_id,
        admission_date: new Date().toISOString(),
        diagnosis,
        treatment_plan
    };

    // Update bed status
    bed.status = 'occupied';
    
    db.admissions.push(newAdmission);
    res.json({ success: true, id: newAdmission.id });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3306;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
