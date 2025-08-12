// db.js
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
const dbDir = process.env.DATA_DIR || './data';
fs.mkdirSync(dbDir, { recursive: true });
const dbFile = path.join(dbDir, 'data.db');
const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
const init = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nis TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('DEPOSIT','WITHDRAW')),
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(student_id) REFERENCES students(id)
    );
  `);
};
export { db, init };