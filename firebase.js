// ---- 1. PASTE YOUR FIREBASE CONFIG HERE (Project settings > Your apps > Config) ----
const firebaseConfig = {
  apiKey: "AIzaSyD4AeOF8T5nh0xrsH5aUS0wb8ukErxALD8",
  authDomain: "gusit-b119e.firebaseapp.com",
  projectId: "gusit-b119e",
  storageBucket: "gusit-b119e.firebasestorage.app",
  messagingSenderId: "293340444662",
  appId: "1:293340444662:web:e2e28c86ceaed4e607f9d7"
};

// ---- 2. Login handling ----
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

auth.onAuthStateChanged(user => {
  if (user) {
    db = firebase.firestore();
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#who').textContent = user.email;
    startApp();
  } else {
    stopApp();
    db = null;
    $('#app').hidden = true;
    $('#login').hidden = false;
  }
});

function login(e) {
  e.preventDefault();
  $('#l_err').textContent = '';
  auth.signInWithEmailAndPassword($('#l_email').value.trim(), $('#l_pass').value)
    .catch(() => { $('#l_err').textContent = 'Wrong email or password.'; });
}

function logout() { auth.signOut(); }
