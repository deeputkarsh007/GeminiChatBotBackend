require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const chatRoutes = require("./routes/chat");
const memoryRoutes = require("./routes/memory");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes
app.use("/api/chat", chatRoutes);
app.use("/api/memory", memoryRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Chatbot API is running" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
