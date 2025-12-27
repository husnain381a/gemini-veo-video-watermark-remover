import express from "express";
import cors from "cors";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import path from "path";

// Tell fluent-ffmpeg to use the static binary
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// 🔧 RAILWAY FIX: USE /tmp DIRECTORY
// ==========================================
// Railway only allows writing files to /tmp
const UPLOAD_DIR = "/tmp/uploads";
const OUTPUT_DIR = "/tmp/outputs";

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ==========================================
// 📂 MULTER CONFIG
// ==========================================
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_, file, cb) => {
    // Replace spaces with underscores to prevent FFmpeg errors
    const safeName = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safeName);
  },
});

const upload = multer({ storage });

// ==========================================
// 🚀 PROCESS ROUTE
// ==========================================
app.post("/process-video", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video uploaded" });
  }

  const inputPath = req.file.path;
  const outputFilename = `clean-${Date.now()}.mp4`;
  const outputPath = path.join(OUTPUT_DIR, outputFilename);

  console.log("🎬 Processing Started:", inputPath);

  ffmpeg(inputPath)
    .videoFilters("crop=in_w-200:in_h-100:0:0") // Your crop logic
    .outputOptions("-movflags faststart")
    .on("start", (cmd) => console.log("Spawned FFmpeg:", cmd))
    .on("end", () => {
      console.log("✅ Processing finished. Sending file...");

      res.download(outputPath, "clean.mp4", (err) => {
        if (err) console.error("Download Error:", err);

        // CLEANUP: Delete files after sending to save space
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {
          console.error("Cleanup failed:", e);
        }
      });
    })
    .on("error", (err, stdout, stderr) => {
      console.error("❌ FFmpeg Failed:", err.message);
      console.error("FFmpeg Stderr:", stderr); // Logs the real reason if it fails

      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Video processing failed", 
          details: err.message 
        });
      }
      
      // Attempt cleanup on error
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (e) {}
    })
    .save(outputPath);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});