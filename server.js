const express = require("express");
const session = require("express-session");
const db = require("./db");

const app = express();

/* ===========================
   BASIC CONFIG
=========================== */
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: "opdesk_secret",
    resave: false,
    saveUninitialized: false
  })
);

/* ===========================
   AUTH MIDDLEWARE
=========================== */
const requireLogin = (role) => (req, res, next) => {
  if (!req.session.user || req.session.role !== role) {
    return res.redirect("/");
  }
  next();
};

/* ===========================
   HOME
=========================== */
app.get("/", (req, res) => {
  res.render("home");
});

/* ===========================
   LOGIN
=========================== */
app.get("/login/:role", (req, res) => {
  res.render("login", { role: req.params.role });
});

app.post("/login/:role", (req, res) => {
  const { username, password } = req.body;
  const role = req.params.role;

  db.query(
    "SELECT * FROM staff_users WHERE username=? AND password=? AND role=?",
    [username, password, role],
    (err, result) => {
      if (err || result.length === 0) {
        return res.send("❌ Invalid Login");
      }

      req.session.user = username;
      req.session.role = role;

      return role === "reception"
        ? res.redirect("/dashboard")
        : res.redirect("/doctor");
    }
  );
});

/* ===========================
   REGISTER STAFF
=========================== */
app.get("/register", (req, res) => {
  res.render("register");
});

app.post("/register", (req, res) => {
  const { username, password, role } = req.body;

  db.query(
    "INSERT INTO staff_users (username,password,role) VALUES (?,?,?)",
    [username, password, role],
    () => res.redirect("/")
  );
});

/* ===========================
   DASHBOARD (RECEPTION)
=========================== */
app.get("/dashboard", requireLogin("reception"), (req, res) => {
  db.query(
    `SELECT
      COUNT(*) AS total,
      SUM(status='Waiting') AS waiting,
      SUM(status='In Consultation') AS consulting,
      SUM(status='Completed') AS completed
     FROM op_patients
     WHERE DATE(created_at)=CURDATE()`,
    (err, rows) => {
      const stats = rows?.[0] || {
        total: 0,
        waiting: 0,
        consulting: 0,
        completed: 0
      };
      res.render("dashboard", { stats });
    }
  );
});

/* ===========================
   NEW OP (SLOT LOCK)
=========================== */
app.get("/op/new", requireLogin("reception"), (req, res) => {
  db.query(
    `SELECT time_slot, COUNT(*) AS count
     FROM op_patients
     WHERE DATE(created_at)=CURDATE()
     GROUP BY time_slot`,
    (err, rows) => {
      const slotCount = {};
      rows?.forEach(r => (slotCount[r.time_slot] = r.count));

      db.query("SELECT * FROM departments", (_, depts) => {
        db.query("SELECT * FROM doctors", (_, docs) => {
          res.render("new_op", { depts, docs, slotCount });
        });
      });
    }
  );
});

app.post("/op/new", requireLogin("reception"), (req, res) => {
  const token = Math.floor(100 + Math.random() * 900);
  const d = req.body;

  db.query(
    `INSERT INTO op_patients
     (token_no,name,mobile,address,scheme_id,complaint,department_id,doctor_id,time_slot,status,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,'Waiting',NOW())`,
    [
      token,
      d.name,
      d.mobile,
      d.address,
      d.scheme,
      d.complaint,
      d.department,
      d.doctor,
      d.time_slot
    ],
    (_, result) => {
  if (!result) return res.send("OP creation failed");
  res.redirect(`/billing/${result.insertId}`);
}

  );
});

/* ===========================
   BILLING (CRITICAL FIX)
=========================== */
app.get("/billing/:id", requireLogin("reception"), (req, res) => {
  res.render("billing", { opId: req.params.id });
});

app.post("/billing/pay", requireLogin("reception"), (req, res) => {
  const { opId, amount, payment_type } = req.body;

  db.query(
    "INSERT INTO billing (op_id,amount,payment_type,status,created_at) VALUES (?,?,?,'Paid',NOW())",
    [opId, amount, payment_type],
    () => res.redirect("/op/today")
  );
});

/* ===========================
   TODAY OPS
=========================== */
app.get("/op/today", requireLogin("reception"), (req, res) => {
  db.query(
    "SELECT * FROM op_patients WHERE DATE(created_at)=CURDATE() ORDER BY created_at",
    (_, ops) => res.render("today_ops", { ops })
  );
});

/* ===========================
   CALL / COMPLETE
=========================== */
app.post("/op/call/:id", requireLogin("reception"), (req, res) => {
  db.query(
    "UPDATE op_patients SET status='In Consultation' WHERE id=?",
    [req.params.id],
    () => res.redirect("back")
  );
});

app.post("/op/complete/:id", requireLogin("reception"), (req, res) => {
  db.query(
    "UPDATE op_patients SET status='Completed' WHERE id=?",
    [req.params.id],
    () => res.redirect("back")
  );
});

/* ===========================
   DOCTOR DASHBOARD
=========================== */
app.get("/doctor", requireLogin("doctor"), (req, res) => {
  db.query(
    "SELECT * FROM op_patients WHERE status!='Completed' ORDER BY created_at",
    (_, ops) => res.render("doctor", { ops })
  );
});

/* ===========================
   OP HISTORY
=========================== */
app.get("/op/history", requireLogin("reception"), (req, res) => {
  db.query(
    "SELECT * FROM op_patients ORDER BY created_at DESC",
    (_, patients) => res.render("op_history", { patients })
  );
});

/* ===========================
   OP LIST (TOP BUTTONS)
=========================== */
app.get("/op/list", requireLogin("reception"), (req, res) => {
  const status = req.query.status;
  let sql = "SELECT * FROM op_patients";
  let params = [];

  if (status && status !== "ALL") {
    sql += " WHERE status=?";
    params.push(status);
  }

  sql += " ORDER BY created_at DESC";

  db.query(sql, params, (_, ops) => {
    if (req.query.partial) {
      res.render("partials/op_list", { ops, status });
    } else {
      res.render("op_list", { ops, status });
    }
  });
});

/* ===========================
   LOGOUT
=========================== */
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ===========================
   SERVER
=========================== */
app.listen(3000, () => {
  console.log("🚀 OP Desk running → http://localhost:3000");
});
