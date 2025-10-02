const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccount = require('./key/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://vrequestsz-default-rtdb.firebaseio.com"
});

const app = express();
const port = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY || "AIzaSyD-JI0Lh4IzHYiD-RpzAJGQzOr6oxU4CwA",
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