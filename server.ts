import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.VITE_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY || process.env.VITE_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/cloudinary/delete", async (req, res) => {
    try {
      const { publicId, resourceType } = req.body;
      
      if (!publicId) {
        return res.status(400).json({ error: "publicId is required" });
      }

      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType || "image",
      });

      res.json({ success: true, result });
    } catch (error) {
      console.error("Cloudinary deletion error:", error);
      res.status(500).json({ error: "Failed to delete media from Cloudinary" });
    }
  });

  app.post("/api/admin/notify-account-deletion", async (req, res) => {
    try {
      const { email, displayName } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "email is required" });
      }

      // Mock email sending
      console.log(`[MOCK EMAIL] To: ${email}, Subject: Account Deletion Warning, Body: Hello ${displayName || 'User'}, your account has been deleted by an administrator.`);
      
      // In a real app, you would use Nodemailer, SendGrid, etc.
      // Example with Nodemailer:
      /*
      const transporter = nodemailer.createTransport({...});
      await transporter.sendMail({
        from: '"Admin" <admin@example.com>',
        to: email,
        subject: "Account Deletion Warning",
        text: `Hello ${displayName}, your account has been deleted by an administrator.`,
      });
      */

      res.json({ success: true, message: "Email notification sent" });
    } catch (error) {
      console.error("Email notification error:", error);
      res.status(500).json({ error: "Failed to send email notification" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
