// firebase-config.js
// Replace with your Firebase project values
const firebaseConfig = {
  apiKey:            "AIzaSyDwd36NyDLimjEFtDWhD4waZ7VhjsaLrC4",
  authDomain:        "dbpulsepoint.firebaseapp.com",
  projectId:         "dbpulsepoint",
  storageBucket:     "dbpulsepoint.firebasestorage.app",
  messagingSenderId: "561885543827",
  appId:             "1:561885543827:web:3060469a2d7d540110fc66"
};

firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();
