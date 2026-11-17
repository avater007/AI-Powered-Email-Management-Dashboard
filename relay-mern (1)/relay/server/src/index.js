import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./routes.js";

const app = express();
app.use(cors(), express.json());
app.use("/api", routes);
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: "Something went wrong. Try again." }); });

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
app.use(express.static(dist));
app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html"), e => e && res.status(404).end()));

await mongoose.connect(process.env.MONGO_URI);
app.listen(process.env.PORT || 4000, () => console.log("Relay API on :" + (process.env.PORT || 4000)));
