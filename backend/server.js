require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;
const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'smvec.ac.in';

// ==================== FIREBASE INITIALIZATION ====================
let db;

function initializeFirebase() {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log('✅ Firebase Admin initialized');
        console.log('✅ Firestore connected');
        return true;
    } catch (error) {
        console.error('❌ Firebase initialization error:', error.message);
        return false;
    }
}

initializeFirebase();

// ==================== MIDDLEWARE ====================
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:3000',
        process.env.FRONTEND_URL
    ],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many attempts. Please try again later.' }
});

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Verify Firebase ID Token middleware
async function verifyToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Get user data from Firestore
        const usersSnapshot = await db.collection('users')
            .where('firebaseUid', '==', decodedToken.uid)
            .limit(1)
            .get();

        if (usersSnapshot.empty) {
            return res.status(404).json({ error: 'User not found in database' });
        }

        req.user = {
            ...decodedToken,
            dbUser: { id: usersSnapshot.docs[0].id, ...usersSnapshot.docs[0].data() }
        };
        next();
    } catch (error) {
        console.error('Token verification error:', error.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// Role check middleware
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user?.dbUser?.role) {
            return res.status(403).json({ error: 'User role not found' });
        }
        if (!roles.includes(req.user.dbUser.role)) {
            return res.status(403).json({
                error: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.dbUser.role}`
            });
        }
        next();
    };
}

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'SmartGate SMVEC API', timestamp: new Date().toISOString() });
});

// ==================== AUTH ROUTES ====================

// Register student (with @smvec.ac.in validation)
app.post('/api/auth/register-student', authLimiter, async (req, res) => {
    try {
        const { email, name, department, year, semester, section, rollNumber, phone, firebaseUid } = req.body;

        // Validate required fields
        if (!email || !name || !department || !year || !section || !rollNumber || !phone || !firebaseUid) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Validate email domain
        if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
            return res.status(400).json({
                error: `Only @${ALLOWED_EMAIL_DOMAIN} email addresses are allowed for student registration`
            });
        }

        // Check if user already exists
        const existingUser = await db.collection('users').where('email', '==', email).limit(1).get();
        if (!existingUser.empty) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        // Find assigned CA (Class Advisor) based on department, year, section
        const caSnapshot = await db.collection('users')
            .where('role', '==', 'advisor')
            .where('handlesDepartment', '==', department)
            .where('handlesYear', '==', year)
            .where('handlesSection', '==', section)
            .limit(1)
            .get();

        // Find assigned HOD based on department
        const hodSnapshot = await db.collection('users')
            .where('role', '==', 'hod')
            .where('handlesDepartment', '==', department)
            .limit(1)
            .get();

        const assignedAdvisorId = caSnapshot.empty ? null : caSnapshot.docs[0].id;
        const assignedHodId = hodSnapshot.empty ? null : hodSnapshot.docs[0].id;

        // Create user document
        const userData = {
            email,
            name,
            phone,
            role: 'student',
            department,
            year,
            semester: semester || year, // Default semester to year if not provided
            section,
            rollNumber,
            firebaseUid,
            assignedAdvisorId,
            assignedHodId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('users').add(userData);

        console.log(`✅ Student registered: ${name} (${email})`);
        console.log(`   Assigned CA: ${assignedAdvisorId || 'None'}, HOD: ${assignedHodId || 'None'}`);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: { id: docRef.id, ...userData },
            warnings: {
                noAdvisor: !assignedAdvisorId ? `No CA found for ${department} Year ${year} Section ${section}` : null,
                noHod: !assignedHodId ? `No HOD found for ${department}` : null
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check if email exists (for Google OAuth registration flow)
app.post('/api/auth/check-email', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const usersSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();

        res.json({
            exists: !usersSnapshot.empty,
            user: usersSnapshot.empty ? null : { id: usersSnapshot.docs[0].id, ...usersSnapshot.docs[0].data() }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get current user profile
app.get('/api/auth/me', verifyToken, async (req, res) => {
    res.json({ user: req.user.dbUser });
});

// Validate role before login
app.post('/api/auth/validate-role', async (req, res) => {
    try {
        const { email, expectedRole } = req.body;

        if (!email || !expectedRole) {
            return res.status(400).json({ error: 'Email and expected role are required' });
        }

        const usersSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();

        if (usersSnapshot.empty) {
            // For students, they might not exist yet (need to register)
            if (expectedRole === 'student') {
                return res.json({ valid: false, needsRegistration: true });
            }
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = usersSnapshot.docs[0].data();
        const isValid = userData.role === expectedRole;

        if (!isValid) {
            const roleNames = {
                student: 'Student',
                advisor: 'Class Advisor',
                hod: 'Head of Department',
                security: 'Security Staff'
            };
            return res.json({
                valid: false,
                error: `You are registered as ${roleNames[userData.role]}, not ${roleNames[expectedRole]}. Please select the correct portal.`
            });
        }

        res.json({ valid: true, user: { id: usersSnapshot.docs[0].id, ...userData } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Link Firebase UID to existing user (for faculty login)
app.post('/api/auth/link-firebase', async (req, res) => {
    try {
        const { email, firebaseUid } = req.body;

        const usersSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();

        if (usersSnapshot.empty) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userDoc = usersSnapshot.docs[0];
        await userDoc.ref.update({ firebaseUid });

        res.json({ success: true, user: { id: userDoc.id, ...userDoc.data(), firebaseUid } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== STUDENT ROUTES ====================

// Create gate pass request
app.post('/api/student/request', verifyToken, requireRole('student'), async (req, res) => {
    try {
        const { reason, destination, exitDate, expectedReturnDate, contactNumber } = req.body;
        const student = req.user.dbUser;

        // Validation
        if (!reason || !destination || !exitDate || !expectedReturnDate || !contactNumber) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (reason.length < 10) {
            return res.status(400).json({ error: 'Reason must be at least 10 characters' });
        }

        // Create request
        const requestData = {
            studentId: student.id,
            studentName: student.name,
            studentEmail: student.email,
            studentRollNumber: student.rollNumber,
            department: student.department,
            year: student.year,
            section: student.section,

            reason,
            destination,
            exitDate,
            expectedReturnDate,
            contactNumber,

            status: 'pending_advisor',

            advisorId: student.assignedAdvisorId,
            advisorStatus: 'pending',
            advisorRemarks: null,
            advisorActionAt: null,

            hodId: student.assignedHodId,
            hodStatus: 'pending',
            hodRemarks: null,
            hodActionAt: null,

            qrToken: null,
            qrUsed: false,
            usedAt: null,
            usedBy: null,

            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('gate_requests').add(requestData);

        console.log(`📝 New gate pass request: ${student.name} (${student.rollNumber})`);

        res.status(201).json({
            success: true,
            message: 'Gate pass request submitted to your Class Advisor',
            request: { id: docRef.id, ...requestData }
        });
    } catch (error) {
        console.error('Create request error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get student's own requests
app.get('/api/student/requests', verifyToken, requireRole('student'), async (req, res) => {
    try {
        const student = req.user.dbUser;

        const requestsSnapshot = await db.collection('gate_requests')
            .where('studentId', '==', student.id)
            .orderBy('createdAt', 'desc')
            .get();

        const requests = requestsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || null
        }));

        res.json({ requests });
    } catch (error) {
        console.error('Get student requests error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== ADVISOR (CA) ROUTES ====================

// Get pending requests for advisor's class
app.get('/api/advisor/requests', verifyToken, requireRole('advisor'), async (req, res) => {
    try {
        const advisor = req.user.dbUser;

        const requestsSnapshot = await db.collection('gate_requests')
            .where('advisorId', '==', advisor.id)
            .where('status', '==', 'pending_advisor')
            .orderBy('createdAt', 'desc')
            .get();

        const requests = requestsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || null
        }));

        res.json({ requests });
    } catch (error) {
        console.error('Get advisor requests error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Advisor approve request
app.post('/api/advisor/approve/:id', verifyToken, requireRole('advisor'), async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;
        const advisor = req.user.dbUser;

        const requestRef = db.collection('gate_requests').doc(id);
        const requestDoc = await requestRef.get();

        if (!requestDoc.exists) {
            return res.status(404).json({ error: 'Request not found' });
        }

        const requestData = requestDoc.data();

        if (requestData.advisorId !== advisor.id) {
            return res.status(403).json({ error: 'Not authorized to approve this request' });
        }

        // Update request - forward to HOD
        await requestRef.update({
            status: 'pending_hod',
            advisorStatus: 'approved',
            advisorRemarks: remarks || 'Approved',
            advisorActionAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ CA approved request ${id} - forwarded to HOD`);

        res.json({ success: true, message: 'Request approved and forwarded to HOD' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Advisor reject request
app.post('/api/advisor/reject/:id', verifyToken, requireRole('advisor'), async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;
        const advisor = req.user.dbUser;

        if (!remarks || remarks.length < 5) {
            return res.status(400).json({ error: 'Rejection remarks are required (min 5 characters)' });
        }

        const requestRef = db.collection('gate_requests').doc(id);
        const requestDoc = await requestRef.get();

        if (!requestDoc.exists) {
            return res.status(404).json({ error: 'Request not found' });
        }

        if (requestDoc.data().advisorId !== advisor.id) {
            return res.status(403).json({ error: 'Not authorized to reject this request' });
        }

        await requestRef.update({
            status: 'rejected',
            advisorStatus: 'rejected',
            advisorRemarks: remarks,
            advisorActionAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`❌ CA rejected request ${id}`);

        res.json({ success: true, message: 'Request rejected' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== HOD ROUTES ====================

// Get pending requests for HOD's department
app.get('/api/hod/requests', verifyToken, requireRole('hod'), async (req, res) => {
    try {
        const hod = req.user.dbUser;

        const requestsSnapshot = await db.collection('gate_requests')
            .where('hodId', '==', hod.id)
            .where('status', '==', 'pending_hod')
            .orderBy('createdAt', 'desc')
            .get();

        const requests = requestsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || null
        }));

        res.json({ requests });
    } catch (error) {
        console.error('Get HOD requests error:', error);
        res.status(500).json({ error: error.message });
    }
});

// HOD approve request - generates QR code
app.post('/api/hod/approve/:id', verifyToken, requireRole('hod'), async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;
        const hod = req.user.dbUser;

        const requestRef = db.collection('gate_requests').doc(id);
        const requestDoc = await requestRef.get();

        if (!requestDoc.exists) {
            return res.status(404).json({ error: 'Request not found' });
        }

        const requestData = requestDoc.data();

        if (requestData.hodId !== hod.id) {
            return res.status(403).json({ error: 'Not authorized to approve this request' });
        }

        // Generate unique QR token
        const qrToken = uuidv4();

        // Update request
        await requestRef.update({
            status: 'approved',
            hodStatus: 'approved',
            hodRemarks: remarks || 'Approved',
            hodActionAt: admin.firestore.FieldValue.serverTimestamp(),
            qrToken
        });

        console.log(`✅ HOD approved request ${id} - QR generated`);

        res.json({
            success: true,
            message: 'Request approved. QR code generated for student.',
            qrToken
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// HOD reject request
app.post('/api/hod/reject/:id', verifyToken, requireRole('hod'), async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;
        const hod = req.user.dbUser;

        if (!remarks || remarks.length < 5) {
            return res.status(400).json({ error: 'Rejection remarks are required (min 5 characters)' });
        }

        const requestRef = db.collection('gate_requests').doc(id);
        const requestDoc = await requestRef.get();

        if (!requestDoc.exists) {
            return res.status(404).json({ error: 'Request not found' });
        }

        if (requestDoc.data().hodId !== hod.id) {
            return res.status(403).json({ error: 'Not authorized to reject this request' });
        }

        await requestRef.update({
            status: 'rejected',
            hodStatus: 'rejected',
            hodRemarks: remarks,
            hodActionAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`❌ HOD rejected request ${id}`);

        res.json({ success: true, message: 'Request rejected' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SECURITY ROUTES ====================

// Verify and mark QR as used
app.post('/api/security/verify-qr', verifyToken, requireRole('security'), async (req, res) => {
    try {
        const { qrToken } = req.body;
        const security = req.user.dbUser;

        if (!qrToken) {
            return res.status(400).json({ error: 'QR token is required' });
        }

        // Find request by QR token
        const requestsSnapshot = await db.collection('gate_requests')
            .where('qrToken', '==', qrToken)
            .limit(1)
            .get();

        if (requestsSnapshot.empty) {
            return res.status(404).json({ error: 'Invalid QR code', valid: false });
        }

        const requestDoc = requestsSnapshot.docs[0];
        const requestData = requestDoc.data();

        // Check if already used
        if (requestData.qrUsed) {
            return res.json({
                valid: false,
                error: 'This QR code has already been used',
                usedAt: requestData.usedAt?.toDate?.(),
                request: requestData
            });
        }

        // Check if approved
        if (requestData.status !== 'approved') {
            return res.json({
                valid: false,
                error: `Request is not approved. Current status: ${requestData.status}`,
                request: requestData
            });
        }

        // Mark as used
        await requestDoc.ref.update({
            status: 'used',
            qrUsed: true,
            usedAt: admin.firestore.FieldValue.serverTimestamp(),
            usedBy: security.id
        });

        // Log the scan
        await db.collection('scan_logs').add({
            requestId: requestDoc.id,
            studentId: requestData.studentId,
            studentName: requestData.studentName,
            studentRollNumber: requestData.studentRollNumber,
            scannedBy: security.id,
            scannedByName: security.name,
            scanTime: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`🔓 Gate pass used: ${requestData.studentName} (${requestData.studentRollNumber})`);

        res.json({
            valid: true,
            message: 'Gate pass verified successfully',
            student: {
                name: requestData.studentName,
                rollNumber: requestData.studentRollNumber,
                department: requestData.department,
                year: requestData.year,
                section: requestData.section
            },
            request: {
                reason: requestData.reason,
                destination: requestData.destination,
                exitDate: requestData.exitDate,
                expectedReturnDate: requestData.expectedReturnDate
            }
        });
    } catch (error) {
        console.error('QR verification error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get scan history
app.get('/api/security/scan-history', verifyToken, requireRole('security'), async (req, res) => {
    try {
        const security = req.user.dbUser;

        const logsSnapshot = await db.collection('scan_logs')
            .where('scannedBy', '==', security.id)
            .orderBy('scanTime', 'desc')
            .limit(50)
            .get();

        const logs = logsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            scanTime: doc.data().scanTime?.toDate?.() || null
        }));

        res.json({ logs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ADMIN ROUTES ====================

// Import faculty (CA/HOD) - bulk or single
app.post('/api/admin/import-faculty', async (req, res) => {
    try {
        const { faculty } = req.body;

        if (!Array.isArray(faculty) || faculty.length === 0) {
            return res.status(400).json({ error: 'Faculty array is required' });
        }

        const results = [];

        for (const f of faculty) {
            const { email, name, phone, role, department, year, section, employeeId, password } = f;

            if (!email || !name || !role || !department) {
                results.push({ email, success: false, error: 'Missing required fields' });
                continue;
            }

            // Check if exists
            const existing = await db.collection('users').where('email', '==', email).limit(1).get();
            if (!existing.empty) {
                results.push({ email, success: false, error: 'User already exists' });
                continue;
            }

            const userData = {
                email,
                name,
                phone: phone || '',
                role,
                employeeId: employeeId || '',
                handlesDepartment: department,
                handlesYear: year || null,
                handlesSection: section || null,
                firebaseUid: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('users').add(userData);
            results.push({ email, success: true, id: docRef.id });

            console.log(`✅ Faculty added: ${name} (${role}) - ${department}`);
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all faculty
app.get('/api/admin/faculty', async (req, res) => {
    try {
        const facultySnapshot = await db.collection('users')
            .where('role', 'in', ['advisor', 'hod', 'security'])
            .get();

        const faculty = facultySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({ faculty });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Seed sample faculty data
app.post('/api/admin/seed-faculty', async (req, res) => {
    try {
        const sampleFaculty = [
            // HODs
            { email: 'hod.cse@smvec.ac.in', name: 'Dr. Ramesh Kumar', role: 'hod', department: 'CSE', phone: '+91 9876543001', employeeId: 'HOD-CSE-001' },
            { email: 'hod.ece@smvec.ac.in', name: 'Dr. Sunita Devi', role: 'hod', department: 'ECE', phone: '+91 9876543002', employeeId: 'HOD-ECE-001' },
            { email: 'hod.it@smvec.ac.in', name: 'Dr. Vijay Sharma', role: 'hod', department: 'IT', phone: '+91 9876543003', employeeId: 'HOD-IT-001' },
            { email: 'hod.eee@smvec.ac.in', name: 'Dr. Lakshmi Priya', role: 'hod', department: 'EEE', phone: '+91 9876543004', employeeId: 'HOD-EEE-001' },
            { email: 'hod.mech@smvec.ac.in', name: 'Dr. Arun Kumar', role: 'hod', department: 'MECH', phone: '+91 9876543005', employeeId: 'HOD-MECH-001' },

            // Class Advisors - CSE
            { email: 'ca.cse.3a@smvec.ac.in', name: 'Prof. Deepa Krishnan', role: 'advisor', department: 'CSE', year: '3', section: 'A', phone: '+91 9876543101', employeeId: 'CA-CSE-3A' },
            { email: 'ca.cse.3b@smvec.ac.in', name: 'Prof. Karthik Rajan', role: 'advisor', department: 'CSE', year: '3', section: 'B', phone: '+91 9876543102', employeeId: 'CA-CSE-3B' },
            { email: 'ca.cse.2a@smvec.ac.in', name: 'Prof. Meena Sundari', role: 'advisor', department: 'CSE', year: '2', section: 'A', phone: '+91 9876543103', employeeId: 'CA-CSE-2A' },
            { email: 'ca.cse.4a@smvec.ac.in', name: 'Prof. Sanjay Kumar', role: 'advisor', department: 'CSE', year: '4', section: 'A', phone: '+91 9876543104', employeeId: 'CA-CSE-4A' },

            // Class Advisors - ECE
            { email: 'ca.ece.3a@smvec.ac.in', name: 'Prof. Anitha Raj', role: 'advisor', department: 'ECE', year: '3', section: 'A', phone: '+91 9876543201', employeeId: 'CA-ECE-3A' },
            { email: 'ca.ece.2a@smvec.ac.in', name: 'Prof. Bala Murugan', role: 'advisor', department: 'ECE', year: '2', section: 'A', phone: '+91 9876543202', employeeId: 'CA-ECE-2A' },

            // Security
            { email: 'security.main@smvec.ac.in', name: 'Rajan Kumar', role: 'security', department: 'Security', phone: '+91 9876543301', employeeId: 'SEC-001' },
            { email: 'security.north@smvec.ac.in', name: 'Suresh Babu', role: 'security', department: 'Security', phone: '+91 9876543302', employeeId: 'SEC-002' }
        ];

        const results = [];

        for (const f of sampleFaculty) {
            const existing = await db.collection('users').where('email', '==', f.email).limit(1).get();
            if (!existing.empty) {
                results.push({ email: f.email, status: 'exists' });
                continue;
            }

            await db.collection('users').add({
                ...f,
                handlesDepartment: f.department,
                handlesYear: f.year || null,
                handlesSection: f.section || null,
                firebaseUid: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            results.push({ email: f.email, status: 'created' });
        }

        res.json({ success: true, message: 'Sample faculty seeded', results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.path}` });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ==================== START SERVER ====================
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`\n🚀 SmartGate SMVEC Server running on port ${PORT}`);
        console.log(`📡 API URL: http://localhost:${PORT}/api`);
        console.log(`📧 Allowed email domain: @${ALLOWED_EMAIL_DOMAIN}`);
        console.log(`\n✨ Ready to accept requests!\n`);
    });
}

module.exports = app;
