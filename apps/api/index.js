const express = require("express");

const app = express();

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("API running on port:", PORT);
});
