import express from "express";
import { resolve } from "node:path";
import { getApp } from "./bootstrap.js";
const app = await getApp();
app.use(express.static(resolve("dist")));
app.listen(Number(process.env.PORT || 3001), "127.0.0.1", () =>
  console.log("Voice Lab API: http://127.0.0.1:3001"),
);
