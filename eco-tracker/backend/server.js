const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory fallback
let reports = [];
let idCounter = 1;

// MongoDB Setup
const reportSchema = new mongoose.Schema({
  phone_number: String,
  resource_type: String,
  area: String,
  timestamp: { type: Date, default: Date.now },
});
const Report = mongoose.model('Report', reportSchema);

let useMongoDB = false;
let usePostgres = false;
let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      phone_number TEXT,
      resource_type TEXT,
      area TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).then(() => {
    console.log('Connected to PostgreSQL and table verified.');
    usePostgres = true;
  }).catch(err => console.error('PostgreSQL connection error:', err));
} else if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log('Connected to MongoDB');
      useMongoDB = true;
    })
    .catch(err => console.error('MongoDB connection error:', err));
} else {
  console.log('No DB URI provided, using in-memory storage for MVP.');
}

function determineArea(phone_number) {
  const lastDigit = parseInt(phone_number.slice(-1) || '0', 10);
  if (lastDigit < 3) return 'Zone A';
  if (lastDigit < 7) return 'Zone B';
  return 'Zone C';
}

async function saveReport(phone_number, resource_type, area) {
  const newReport = { phone_number, resource_type, area, timestamp: new Date() };
  if (usePostgres) {
    const res = await pool.query(
      'INSERT INTO reports (phone_number, resource_type, area) VALUES ($1, $2, $3) RETURNING *',
      [phone_number, resource_type, area]
    );
    return res.rows[0];
  } else if (useMongoDB) {
    const report = new Report(newReport);
    return await report.save();
  } else {
    newReport.id = idCounter++;
    reports.push(newReport);
    return newReport;
  }
}

async function getAllReports() {
  if (usePostgres) {
    const res = await pool.query('SELECT * FROM reports ORDER BY timestamp DESC LIMIT 100');
    return res.rows;
  } else if (useMongoDB) {
    return await Report.find().sort({ timestamp: -1 }).limit(100);
  } else {
    return [...reports].sort((a, b) => b.timestamp - a.timestamp);
  }
}

app.post('/report', async (req, res) => {
  const { phone_number, resource_type } = req.body;
  const area = determineArea(phone_number);
  const report = await saveReport(phone_number, resource_type, area);
  res.json({ message: 'Report logged successfully', report });
});

app.get('/logs', async (req, res) => {
  const data = await getAllReports();
  res.json(data);
});

app.get('/stats', async (req, res) => {
  const allReports = await getAllReports();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayReports = allReports.filter(r => new Date(r.timestamp) >= todayStart);
  
  const byType = todayReports.reduce((acc, r) => {
    acc[r.resource_type] = (acc[r.resource_type] || 0) + 1;
    return acc;
  }, {});

  const byArea = todayReports.reduce((acc, r) => {
    acc[r.area] = (acc[r.area] || 0) + 1;
    return acc;
  }, {});

  const score = Math.max(0, 100 - (todayReports.length * 5));

  res.json({ score, totalToday: todayReports.length, byType, byArea });
});

app.get('/insights', async (req, res) => {
  const allReports = await getAllReports();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  
  const todayReports = allReports.filter(r => new Date(r.timestamp) >= todayStart);
  const yesterdayReports = allReports.filter(r => new Date(r.timestamp) >= yesterdayStart && new Date(r.timestamp) < todayStart);

  const nudges = [];
  if (todayReports.length > yesterdayReports.length && yesterdayReports.length > 0) {
    nudges.push({ type: 'warning', text: 'Waste reports increased today.' });
  } else if (todayReports.length < yesterdayReports.length) {
    nudges.push({ type: 'success', text: 'Reduction in waste reports observed.' });
  }

  const byArea = todayReports.reduce((acc, r) => {
    acc[r.area] = (acc[r.area] || 0) + 1;
    return acc;
  }, {});

  let maxArea = null;
  let maxCount = 0;
  for (const [area, count] of Object.entries(byArea)) {
    if (count > maxCount) {
      maxCount = count;
      maxArea = area;
    }
  }

  if (maxArea) nudges.push({ type: 'alert', text: `${maxArea} needs attention.` });
  if (nudges.length === 0) nudges.push({ type: 'info', text: 'Community activity is stable.' });

  res.json(nudges);
});

app.post('/webhook/call', (req, res) => {
  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather action="/webhook/process" numDigits="1" timeout="10">
        <Say voice="alice">Welcome to the Eco Tracker community hotline.</Say>
        <Say voice="alice">Press 1 for water, 2 for power, 3 for garbage.</Say>
    </Gather>
</Response>`;
  res.type('text/xml').send(responseXml);
});

app.post('/webhook/process', async (req, res) => {
  const { From, Digits } = req.body; 
  let resource_type = 'unknown';
  if (Digits === '1') resource_type = 'water';
  if (Digits === '2') resource_type = 'electricity';
  if (Digits === '3') resource_type = 'waste';

  const area = determineArea(From || '0');
  await saveReport(From || 'Unknown', resource_type, area);

  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">Thank you. Your report is logged. Goodbye!</Say></Response>`;
  res.type('text/xml').send(responseXml);
});

app.all('/webhook/exotel', async (req, res) => {
  console.log('--- Incoming Exotel Webhook ---');
  const data = req.method === 'POST' ? req.body : req.query;
  const CallFrom = data.CallFrom || data.From || data.FromPhoneNumber;
  let digits = data.digits || data.Digits;
  
  if (digits) digits = digits.toString().replace(/"/g, '');

  let resource_type = 'unknown';
  if (digits === '1') resource_type = 'water';
  if (digits === '2') resource_type = 'electricity';
  if (digits === '3') resource_type = 'waste';

  const area = determineArea(CallFrom || '0');
  await saveReport(CallFrom || 'Unknown', resource_type, area);

  res.type('text/plain').send('success');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend server running on port ${PORT}`));
