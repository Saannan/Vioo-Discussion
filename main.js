const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccount = require('./key/serviceAccountKey.json');
const allowedIPs = require('./key/ip.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://vrequestsz-default-rtdb.firebaseio.com"
});

const app = express();
const port = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/firebase-config', (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
        const clientIp = req.headers['x-vercel-forwarded-for'] || req.ip;
        
        const isAllowedIP = (clientIp === allowedIPs.allowedIPv4 || clientIp === allowedIPs.allowedIPv6);

        if (!isAllowedIP) {
            return res.status(403).json({ error: 'Forbidden: IP address not allowed.' });
        }
        
        const referer = req.get('Referer');
        const clientIdentifier = req.get('X-Client-Identifier');
        const allowedReferer = 'https://discussion.vioo.my.id/';

        if (!referer || !referer.startsWith(allowedReferer) || clientIdentifier !== 'ViooWebAppClient') {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }

    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: "vrequestsz.firebaseapp.com",
        databaseURL: "https://vrequestsz-default-rtdb.firebaseio.com",
        projectId: "vrequestsz",
        storageBucket: "vrequestsz.appspot.com",
        messagingSenderId: "1018071701443",
        appId: "1:1018071701443:web:5089b3cee22ba2b41fcf76",
        measurementId: "G-HRNV160RSS"
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

module.exports = app;