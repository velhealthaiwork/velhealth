const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.MYSQL_HOST || "maglev.proxy.rlwy.net",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "TvrJSGzNQHbHjDpGwSvVESEXPzgCEKbp",
  database: process.env.MYSQL_DATABASE || "velhealthai",
  port: process.env.MYSQL_PORT || 27242,
  ssl: {
    rejectUnauthorized: false
  },
  connectTimeout: 10000
});

db.connect(err => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
    return;
  }
  console.log("✅ Database Connected");
});

module.exports = db;
