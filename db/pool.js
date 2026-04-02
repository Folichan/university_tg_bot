import mysql from "mysql2/promise";
import { DB_HOST, DB_USER, DB_PASS, DB_NAME } from "../config/env.js";

export const db = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  connectionLimit: 10,
});
