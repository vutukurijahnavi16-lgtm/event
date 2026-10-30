import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection, getDocs,
  query, orderBy, where, runTransaction, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Firebase web configuration (Firebase Console → Project settings → Your apps)
const firebaseConfig = {
  apiKey: "AIzaSyAdr2G4gLlJpgNYFkgeHLDYuZmg1AU-lvI",
  authDomain: "events2026-89a7e.firebaseapp.com",
  projectId: "events2026-89a7e",
  storageBucket: "events2026-89a7e.firebasestorage.app",
  messagingSenderId: "1029498871419",
  appId: "1:1029498871419:web:83ee6641921e968deaccde",
  measurementId: "G-RYWQMXFX2E"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
let currentUser = null, currentProfile = null, allEvents = [], allStudents = [];
const toast = (message) => { $("toastText").textContent = message; bootstrap.Toast.getOrCreateInstance($("toast")).show(); };
function showMessage(id, message, type="danger") {
  const el = $(id); el.textContent = message; el.className = `alert alert-${type}`; el.classList.remove("d-none");
}
function hideMessage(id) { $(id).classList.add("d-none"); }
function friendlyError(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use":"This email already has an account. Please log in.",
    "auth/invalid-email":"Please enter a valid email address.",
    "auth/weak-password":"Password must be at least 6 characters.",
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/user-not-found":"No account found. Please sign up first.",
    "auth/wrong-password":"Email or password is incorrect.",
    "permission-denied":"Firebase rules blocked this action. Check README setup and Firestore rules.",
    "failed-precondition":"A Firestore index or database setup may be missing. Check Firebase Console."
  };
  return map[code] || error?.message || "Something went wrong. Please try again.";
}
function setBusy(form, busy) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = busy;
  btn.querySelector(".btn-label")?.classList.toggle("d-none", busy);
  btn.querySelector(".spinner-border")?.classList.toggle("d-none", !busy);
}
function validForm(form) {
  form.classList.add("was-validated");
  return form.checkValidity();
}
function switchAuth(which) {
  const login = which === "login";
  $("loginForm").classList.toggle("d-none", !login);
  $("signupForm").classList.toggle("d-none", login);
  $("loginTab").classList.toggle("active", login);
  $("signupTab").classList.toggle("active", !login);
  hideMessage("authMessage");
}
$("loginTab").addEventListener("click", () => switchAuth("login"));
$("signupTab").addEventListener("click", () => switchAuth("signup"));

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); hideMessage("authMessage");
  if (!validForm(e.currentTarget)) return;
  setBusy(e.currentTarget, true);
  try {
    await signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPassword").value);
  } catch (err) { showMessage("authMessage", friendlyError(err)); }
  finally { setBusy(e.currentTarget, false); }
});

$("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault(); hideMessage("authMessage");
  if (!validForm(e.currentTarget)) return;
  const name = $("signupName").value.trim(), roll = $("signupRoll").value.trim().toUpperCase();
  const dept = $("signupDept").value.trim(), email = $("signupEmail").value.trim().toLowerCase();
  const password = $("signupPassword").value;
  if (!name || !roll || !dept || !email) return showMessage("authMessage", "Please fill in every field.");
  setBusy(e.currentTarget, true);
  let createdUser = null;
  try {
    // Roll-number reservation is a transaction so two simultaneous signups cannot claim the same roll.
    const rollRef = doc(db, "rollNumbers", roll);
    const existingRoll = await getDoc(rollRef);
    if (existingRoll.exists()) throw new Error("That roll number is already registered. Check it and try again.");
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    createdUser = credential.user;
    await updateProfile(createdUser, { displayName: name });
    await runTransaction(db, async (tx) => {
      const freshRoll = await tx.get(rollRef);
      if (freshRoll.exists()) throw new Error("That roll number is already registered. Please log in or contact the administrator.");
      tx.set(rollRef, { uid: createdUser.uid, rollNumber: roll, createdAt: serverTimestamp() });
      tx.set(doc(db, "users", createdUser.uid), {
        uid: createdUser.uid, name, rollNumber: roll, department: dept, email,
        role: "student", createdAt: serverTimestamp()
      });
    });
    $("signupForm").reset(); $("signupForm").classList.remove("was-validated");
    toast("Student account created successfully.");
  } catch (err) {
    // If account creation succeeded but profile creation failed, do not silently leave a half-configured account.
    if (createdUser && err?.message?.includes("roll number")) {
      try { await deleteDoc(doc(db, "users", createdUser.uid)); } catch (_) {}
      // Firebase Auth account removal is intentionally not attempted here; see README recovery note.
    }
    showMessage("authMessage", friendlyError(err));
  } finally { setBusy(e.currentTarget, false); }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));
$("studentSearch").addEventListener("input", renderStudents);
$("eventForm").addEventListener("submit", async (e) => {
  e.preventDefault(); hideMessage("eventMessage");
  if (!validForm(e.currentTarget)) return;
  if (currentProfile?.role !== "admin") return showMessage("eventMessage", "Only administrators can publish events.");
  const title = $("eventTitle").value.trim(), description = $("eventDescription").value.trim();
  const date = $("eventDate").value, time = $("eventTime").value, venue = $("eventVenue").value.trim();
  const capacity = Number($("eventCapacity").value);
  if (!title || !description || !date || !time || !venue || !Number.isInteger(capacity) || capacity < 1)
    return showMessage("eventMessage", "Please enter valid details in every field.");
  if (date < new Date().toISOString().slice(0,10)) return showMessage("eventMessage", "Event date cannot be in the past.");
  try {
    await addDoc(collection(db, "events"), {
      title, description, date, time, venue, capacity, createdBy: currentUser.uid,
      createdAt: serverTimestamp(), registrations: []
    });
    bootstrap.Modal.getOrCreateInstance($("eventModal")).hide();
    $("eventForm").reset(); $("eventForm").classList.remove("was-validated");
    toast("Event published!"); await loadDashboard();
  } catch (err) { showMessage("eventMessage", friendlyError(err)); }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    currentProfile = null;
    $("authView").classList.remove("d-none"); $("appView").classList.add("d-none");
    $("logoutBtn").classList.add("d-none"); $("userBadge").textContent = "";
    return;
  }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      await signOut(auth);
      showMessage("authMessage", "Your profile is not set up. Ask the administrator to configure your account.");
      return;
    }
    currentProfile = snap.data();
    $("authView").classList.add("d-none"); $("appView").classList.remove("d-none");
    $("logoutBtn").classList.remove("d-none");
    $("userBadge").textContent = `${currentProfile.name || user.email} · ${currentProfile.role}`;
    await loadDashboard();
  } catch (err) {
    showMessage("authMessage", friendlyError(err));
    await signOut(auth);
  }
});

async function loadDashboard() {
  if (!currentProfile) return;
  const admin = currentProfile.role === "admin";
  $("dashboardTitle").textContent = admin ? "Admin dashboard" : `Hello, ${currentProfile.name.split(" ")[0]}!`;
  $("dashboardSubtitle").textContent = admin ? "A clear view of your campus events and registrations." : "Your next campus experience starts here.";
  $("adminActions").classList.toggle("d-none", !admin);
  $("adminStudentPanel").classList.toggle("d-none", !admin);
  $("eventsHeading").textContent = admin ? "Manage events" : "Explore upcoming events";
  const [eventSnap, studentSnap] = await Promise.all([
    getDocs(query(collection(db, "events"), orderBy("date", "asc"))),
    admin ? getDocs(query(collection(db, "users"), where("role", "==", "student"))) : Promise.resolve(null)
  ]);
  allEvents = eventSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  allStudents = studentSnap ? studentSnap.docs.map(d => d.data()) : [];
  renderStats(admin); renderEvents(); if (admin) renderStudents();
}
function renderStats(admin) {
  const registrations = allEvents.reduce((n, e) => n + (e.registrations || []).length, 0);
  const myRegistrations = allEvents.filter(e => (e.registrations || []).includes(currentUser.uid)).length;
  const stats = admin ? [
    ["bi-calendar-event","Total events",allEvents.length,"Events published"],
    ["bi-people","Students",allStudents.length,"Student accounts"],
    ["bi-ticket-perforated","Registrations",registrations,"All event bookings"],
    ["bi-graph-up-arrow","Avg. registrations",allEvents.length ? (registrations/allEvents.length).toFixed(1) : "0","Per event"]
  ] : [
    ["bi-calendar-event","Upcoming events",allEvents.filter(isUpcoming).length,"Ready to explore"],
    ["bi-ticket-perforated","My registrations",myRegistrations,"Events you joined"],
    ["bi-person-badge","Roll number",currentProfile.rollNumber,"Student profile"],
    ["bi-building","Department",currentProfile.department,"Your department"]
  ];
  $("statsRow").innerHTML = stats.map((s,i)=>`<div class="col-6 col-lg-3"><div class="stat-card" style="animation:rise .4s ${i*70}ms both"><div class="stat-icon"><i class="bi ${s[0]}"></i></div><div class="stat-number">${escapeHtml(String(s[2]))}</div><div class="fw-bold">${escapeHtml(s[1])}</div><div class="small muted">${escapeHtml(s[3])}</div></div></div>`).join("");
}
function isUpcoming(event) { return `${event.date || ""}T${event.time || "23:59"}` >= new Date().toISOString().slice(0,16); }
function renderEvents() {
  const list = currentProfile.role === "admin" ? allEvents : allEvents.filter(isUpcoming);
  $("eventCount").textContent = `${list.length} ${list.length === 1 ? "event" : "events"}`;
  $("emptyEvents").classList.toggle("d-none", list.length !== 0);
  $("eventsGrid").innerHTML = list.map((event,i) => {
    const registrations = event.registrations || [];
    const registered = registrations.includes(currentUser.uid);
    const full = registrations.length >= Number(event.capacity || 0);
    const dateText = event.date ? new Date(`${event.date}T00:00:00`).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "Date TBA";
    const studentAction = registered ? `<button class="btn btn-sm btn-outline-secondary" disabled><i class="bi bi-check2-circle me-1"></i>Registered</button>` :
      `<button class="btn btn-sm btn-primary" onclick="window.registerForEvent('${event.id}')" ${full ? "disabled" : ""}>${full ? "Full" : "Register"} <i class="bi bi-arrow-up-right ms-1"></i></button>`;
    const adminAction = `<span class="small muted">${registrations.length}/${event.capacity} joined</span><button class="btn btn-sm btn-outline-danger" onclick="window.removeEvent('${event.id}')"><i class="bi bi-trash3"></i></button>`;
    return `<div class="col-md-6 col-xl-4"><article class="event-card" style="animation-delay:${i*45}ms"><div class="event-banner"></div><div class="event-body"><span class="event-date"><i class="bi bi-calendar3"></i>${escapeHtml(dateText)} · ${escapeHtml(event.time || "")}</span><h3 class="event-title">${escapeHtml(event.title)}</h3><p class="event-description">${escapeHtml(event.description)}</p><div class="event-meta"><i class="bi bi-geo-alt"></i><span>${escapeHtml(event.venue)}</span></div><div class="event-meta"><i class="bi bi-people"></i><span>${registrations.length} registered · ${Math.max(0,Number(event.capacity||0)-registrations.length)} spots left</span></div><div class="event-bottom">${full ? '<span class="pill full">Fully booked</span>' : '<span class="pill">Open for registration</span>'}${currentProfile.role === "admin" ? adminAction : studentAction}</div></div></article></div>`;
  }).join("");
}
window.registerForEvent = async (eventId) => {
  try {
    const ref = doc(db,"events",eventId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("This event no longer exists.");
      const event = snap.data(), regs = event.registrations || [];
      if (regs.includes(currentUser.uid)) throw new Error("You are already registered for this event.");
      if (regs.length >= Number(event.capacity || 0)) throw new Error("Sorry, this event is full.");
      tx.update(ref,{registrations:[...regs,currentUser.uid]});
    });
    toast("You’re registered for the event!"); await loadDashboard();
  } catch (err) { toast(friendlyError(err)); }
};
window.removeEvent = async (eventId) => {
  if (currentProfile?.role !== "admin") return;
  if (!confirm("Delete this event and its registrations?")) return;
  try { await deleteDoc(doc(db,"events",eventId)); toast("Event deleted."); await loadDashboard(); }
  catch(err) { toast(friendlyError(err)); }
};
function renderStudents() {
  const search = ($("studentSearch")?.value || "").trim().toLowerCase();
  const filtered = allStudents.filter(s => [s.name,s.rollNumber,s.department,s.email].some(v => String(v||"").toLowerCase().includes(search)));
  $("studentsTable").innerHTML = filtered.length ? filtered.map(s=>`<tr><td class="fw-semibold">${escapeHtml(s.name||"")}</td><td><span class="badge rounded-pill badge-student">${escapeHtml(s.rollNumber||"")}</span></td><td>${escapeHtml(s.department||"")}</td><td>${escapeHtml(s.email||"")}</td></tr>`).join("") : `<tr><td colspan="4" class="text-center muted py-4">No students found.</td></tr>`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
