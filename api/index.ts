import type { Request, Response } from "express";
import { getApp } from "../src/server/bootstrap.js";
export default async function handler(req: Request, res: Response) {
  try {
    const app = await getApp();
    app(req, res);
  } catch {
    res.status(503).json({ error: "后端尚未就绪，请配置数据库并执行迁移。" });
  }
}
