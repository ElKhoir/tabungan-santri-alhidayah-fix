// server.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { db, init } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
init();
const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
const hashPin = (pin) => Buffer.from(`salt:${pin}`).toString('base64');
const verifyPin = (pin, hash) => hash === hashPin(pin);
const auth = (roles = ['user','admin']) => (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token diperlukan' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!roles.includes(payload.role)) return res.status(403).json({ error: 'Akses ditolak' });
    req.user = payload;
    next();
  } catch (e) { return res.status(401).json({ error: 'Token tidak valid' }); }
};
app.post('/api/auth/login-admin', (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Kata sandi admin salah' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, role: 'admin' });
});
app.post('/api/auth/login', (req, res) => {
  const { nis, pin } = req.body;
  if (!nis || !pin) return res.status(400).json({ error: 'NIS dan PIN wajib' });
  const row = db.prepare('SELECT id, nis, name, pin FROM students WHERE nis = ?').get(nis);
  if (!row) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  if (!verifyPin(pin, row.pin)) return res.status(401).json({ error: 'PIN salah' });
  const token = jwt.sign({ role: 'user', id: row.id, nis: row.nis, name: row.name }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, role: 'user', student: { id: row.id, nis: row.nis, name: row.name } });
});
app.get('/api/me', auth(['user','admin']), (req, res) => { res.json({ me: req.user }); });
const getSaldo = (studentId) => {
  const sum = db.prepare('SELECT COALESCE(SUM(CASE WHEN type="DEPOSIT" THEN amount ELSE -amount END),0) as saldo FROM transactions WHERE student_id = ?').get(studentId);
  return sum?.saldo || 0;
};
app.get('/api/students', auth(['admin']), (req, res) => {
  const rows = db.prepare('SELECT id, nis, name, created_at FROM students ORDER BY id DESC').all();
  const withSaldo = rows.map(r => ({ ...r, saldo: getSaldo(r.id) }));
  res.json(withSaldo);
});
app.post('/api/students', auth(['admin']), (req, res) => {
  const { nis, name, pin } = req.body;
  if (!nis || !name || !pin) return res.status(400).json({ error: 'nis, name, pin wajib' });
  try {
    const info = db.prepare('INSERT INTO students (nis, name, pin) VALUES (?,?,?)').run(nis, name, hashPin(pin));
    res.status(201).json({ id: info.lastInsertRowid, nis, name, saldo: 0 });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'NIS sudah dipakai' });
    res.status(500).json({ error: 'Gagal menambah siswa' });
  }
});
app.put('/api/students/:id', auth(['admin']), (req, res) => {
  const { id } = req.params;
  const { nis, name, pin } = req.body;
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  const newNis = nis ?? student.nis;
  const newName = name ?? student.name;
  const newPin = pin ? hashPin(pin) : student.pin;
  try {
    db.prepare('UPDATE students SET nis=?, name=?, pin=? WHERE id=?').run(newNis, newName, newPin, id);
    res.json({ id: Number(id), nis: newNis, name: newName, saldo: getSaldo(id) });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'NIS sudah dipakai' });
    res.status(500).json({ error: 'Gagal memperbarui siswa' });
  }
});
app.delete('/api/students/:id', auth(['admin']), (req, res) => {
  const { id } = req.params;
  const st = db.prepare('DELETE FROM students WHERE id=?').run(id);
  db.prepare('DELETE FROM transactions WHERE student_id=?').run(id);
  if (st.changes === 0) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  res.json({ ok: true });
});
app.post('/api/transactions', auth(['admin']), (req, res) => {
  const { student_id, amount, type, note } = req.body;
  if (!student_id || !amount || !type) return res.status(400).json({ error: 'student_id, amount, type wajib' });
  if (!['DEPOSIT','WITHDRAW'].includes(type)) return res.status(400).json({ error: 'type harus DEPOSIT/WITHDRAW' });
  const student = db.prepare('SELECT id FROM students WHERE id=?').get(student_id);
  if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  if (type === 'WITHDRAW') {
    const saldo = getSaldo(student_id);
    if (amount > saldo) return res.status(400).json({ error: 'Saldo tidak cukup' });
  }
  const info = db.prepare('INSERT INTO transactions (student_id, amount, type, note) VALUES (?,?,?,?)').run(student_id, amount, type, note ?? null);
  res.status(201).json({ id: info.lastInsertRowid });
});
app.get('/api/transactions/:studentId', auth(['admin','user']), (req, res) => {
  const { studentId } = req.params;
  if (req.user.role === 'user' && Number(req.user.id) !== Number(studentId)) {
    return res.status(403).json({ error: 'Tidak boleh melihat transaksi siswa lain' });
  }
  const rows = db.prepare('SELECT id, amount, type, note, created_at FROM transactions WHERE student_id = ? ORDER BY id DESC').all(studentId);
  res.json(rows);
});
app.get('/api/balance/:studentId', auth(['admin','user']), (req, res) => {
  const { studentId } = req.params;
  if (req.user.role === 'user' && Number(req.user.id) !== Number(studentId)) {
    return res.status(403).json({ error: 'Tidak boleh melihat saldo siswa lain' });
  }
  res.json({ saldo: getSaldo(studentId) });
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.listen(PORT, () => { console.log(`Server berjalan di http://localhost:${PORT}`); });
