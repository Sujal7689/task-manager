import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env";

export function makeUploader(subdir: string) {
  const dir = path.join(path.resolve(env.uploadDir), subdir);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

  return { upload: multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }), dir, subdir };
}
