const express = require("express");
const session = require("express-session");
const db = require("./db");

const app = express();

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: "opdesk_secret",
    resave: false,
    saveUninitialized: true
  })
);

/* ===========================
   HOME
=========================== */
app.get("/", (req, res) => {
  res.render("home");
});

/* ===========================
   ROLE BASED LOGIN
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
      if (result.length === 0) return res.send("❌ Invalid Login");

      req.session.user = username;
      req.session.role = role;

      if (role === "reception") res.redirect("/dashboard");
      else res.redirect("/doctor");
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
    "INSERT INTO staff_users VALUES (NULL,?,?,?)",
    [username, password, role],
    () => res.redirect("/")
  );
});

/* ===========================
   RECEPTION DASHBOARD
=========================== */
app.get("/dashboard", (req, res) => {
  if (req.session.role !== "reception") return res.redirect("/");

  db.query(
    `SELECT
      COUNT(*) AS total,
      SUM(status='Waiting') AS waiting,
      SUM(status='In Consultation') AS consulting,
      SUM(status='Completed') AS completed
     FROM op_patients
     WHERE DATE(created_at) = CURDATE()`,
    (err, rows) => {

      const stats = rows && rows.length
        ? rows[0]
        : { total: 0, waiting: 0, consulting: 0, completed: 0 };

      res.render("dashboard", { stats });
    }
  );
});


/* ===========================
   NEW OP + SLOT AUTO LOCK
=========================== */
app.get("/op/new", (req, res) => {
  if (req.session.role !== "reception") return res.redirect("/");

  db.query(
    `SELECT time_slot, COUNT(*) AS count
     FROM op_patients
     WHERE DATE(created_at) = CURDATE()
     GROUP BY time_slot`,
    (err, rows) => {

      const slotCount = {};   // ✅ ALWAYS DEFINED

      if (rows && rows.length > 0) {
        rows.forEach(r => {
          slotCount[r.time_slot] = r.count;
        });
      }

      db.query("SELECT * FROM departments", (e, depts) => {
        db.query("SELECT * FROM doctors", (e2, docs) => {
          res.render("new_op", {
            depts,
            docs,
            slotCount   // ✅ SENT NO MATTER WHAT
          });
        });
      });
    }
  );
});

app.post("/op/new", (req, res) => {
  const token = Math.floor(100 + Math.random() * 900);
  const d = req.body;

  db.query(
    `INSERT INTO op_patients
    (token_no,name,mobile,address,scheme_id,complaint,department_id,doctor_id,time_slot)
    VALUES (?,?,?,?,?,?,?,?,?)`,
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
    (err, result) => {
      res.redirect(`/billing/${result.insertId}`);
    }
  );
});

/* ===========================
   BILLING
=========================== */
app.get("/billing/:id", (req, res) => {
  res.render("billing", { opId: req.params.id });
});

app.post("/billing/pay", (req, res) => {
  const { opId, amount, payment_type } = req.body;

  db.query(
    "INSERT INTO billing VALUES (NULL,?,?,?, 'Paid', NOW())",
    [opId, amount, payment_type],
    () => res.redirect("/op/today")
  );
});

/* ===========================
   TODAY OPS
=========================== */
app.get("/op/today", (req, res) => {
  db.query(
    "SELECT * FROM op_patients WHERE DATE(created_at)=CURDATE() ORDER BY created_at",
    (err, ops) => {
      res.render("today_ops", { ops });
    }
  );
});

/* ===========================
   CALL / COMPLETE
=========================== */
app.post("/op/call/:id", (req, res) => {
  db.query(
    "UPDATE op_patients SET status='In Consultation' WHERE id=?",
    [req.params.id],
    () => res.redirect("back")
  );
});

app.post("/op/complete/:id", (req, res) => {
  db.query(
    "UPDATE op_patients SET status='Completed' WHERE id=?",
    [req.params.id],
    () => res.redirect("back")
  );
});

/* ===========================
   DOCTOR SCREEN
=========================== */
app.get("/doctor", (req, res) => {
  if (req.session.role !== "doctor") return res.redirect("/");

  db.query(
    "SELECT * FROM op_patients WHERE status!='Completed' ORDER BY created_at",
    (err, ops) => {
      res.render("doctor", { ops });
    }
  );
});

/* ===========================
   OP HISTORY & REVISIT
=========================== */
app.get("/op/history", (req, res) => {
  db.query(
    "SELECT * FROM op_patients ORDER BY created_at DESC",
    (err, patients) => {
      if (err) patients = [];
      res.render("op_history", { patients });
    }
  );
});



app.post("/op/history", (req, res) => {
  db.query(
    "SELECT * FROM op_patients WHERE mobile=? ORDER BY created_at DESC",
    [req.body.mobile],
    (err, patients) => {
      res.render("op_history", { patients });
    }
  );
});
app.get("/op/history/search", (req, res) => {
  const mobile = req.query.mobile;

  let sql = "SELECT * FROM op_patients";
  let params = [];

  if (mobile && mobile.length > 0) {
    sql += " WHERE mobile LIKE ?";
    params.push(`%${mobile}%`);
  }

  sql += " ORDER BY created_at DESC";

  db.query(sql, params, (err, rows) => {
    if (err) return res.json([]);
    res.json(rows);
  });
});


app.get("/op/revisit/:id", (req, res) => {
  db.query(
    "SELECT * FROM op_patients WHERE id=?",
    [req.params.id],
    (err, old) => {
      db.query("SELECT * FROM departments", (e, depts) => {
        db.query("SELECT * FROM doctors", (e2, docs) => {
          res.render("new_op", {
            depts,
            docs,
            old: old[0]
          });
        });
      });
    }
  );
});
app.get("/op/list", (req, res) => {
  const status = req.query.status;

  let sql = "SELECT * FROM op_patients";
  let params = [];

  if (status && status !== "ALL") {
    sql += " WHERE status = ?";
    params.push(status);
  }

  sql += " ORDER BY created_at DESC";

  db.query(sql, params, (err, ops) => {
    if (err) ops = [];

    // 🔥 IMPORTANT PART
    if (req.query.partial) {
      res.render("partials/op_list", { ops, status });
    } else {
      res.render("op_list", { ops, status });
    }
  });
});


/* ===========================
   SERVER
=========================== */
app.listen(3000, () =>
  console.log("🚀 Server running → http://localhost:3000")
);
