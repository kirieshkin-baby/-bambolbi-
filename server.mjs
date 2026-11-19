import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync, unlinkSync, createReadStream } from 'node:fs';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { writeFile } from 'node:fs/promises';
import { seed } from './demo.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const data = process.env.BAMBOLBI_DATA || join(root, 'runtime');
const uploads = join(data, 'uploads');
const MAX_SIZE = 30 * 1024 * 1024;
const DAY = 86400000;
const MOSCOW = 10800000;
const token = process.env.BAMBOLBI_API_TOKEN;
const run = promisify(execFile);
if (!token) throw Error('Запускайте API через app.py.');
mkdirSync(uploads, { recursive: true });
const db = new DatabaseSync(join(data, 'bambolbi.sqlite3'));
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS screens (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL,
    lat REAL NOT NULL, lon REAL NOT NULL, resolution TEXT NOT NULL, status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, customer TEXT NOT NULL, target INTEGER NOT NULL, status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, file TEXT NOT NULL UNIQUE, mime TEXT NOT NULL,
    size INTEGER NOT NULL, status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY, screen_id INTEGER NOT NULL REFERENCES screens(id),
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id), media_id INTEGER NOT NULL REFERENCES media(id),
    starts INTEGER NOT NULL, ends INTEGER NOT NULL CHECK(ends > starts), cycle INTEGER NOT NULL CHECK(cycle BETWEEN 3 AND 120)
  );
  CREATE INDEX IF NOT EXISTS slots_screen_time ON slots(screen_id, starts, ends);
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, at INTEGER NOT NULL, slot_id INTEGER NOT NULL, cycle_start INTEGER NOT NULL,
    screen_id INTEGER NOT NULL, campaign_id INTEGER NOT NULL, media_id INTEGER NOT NULL,
    screen TEXT NOT NULL, campaign TEXT NOT NULL, media TEXT NOT NULL, UNIQUE(slot_id, cycle_start)
  );
  CREATE INDEX IF NOT EXISTS events_at ON events(at);
  CREATE INDEX IF NOT EXISTS events_campaign ON events(campaign_id);
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, object TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, due TEXT NOT NULL, status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS risks (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, severity TEXT NOT NULL, response TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);
// Historical events retain their IDs, so entity IDs must never be reused.
// SQLite's default rowid allocation can reuse deleted records at the end of a table.
function nextId(table) {
  const key = 'seq_' + table;
  return db.prepare("INSERT INTO settings VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 RETURNING CAST(value AS INTEGER) AS id").get(key).id;
}
function put(table, values) {
  const row = { id: nextId(table), ...values };
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
  return row.id;
}
function transaction(work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
transaction(() => {
  if (!db.prepare("SELECT value FROM settings WHERE key = 'initialized'").get()) {
    seed({ db, put, uploads, root, copyFileSync, now: Date.now(), DAY, MOSCOW });
    db.prepare("INSERT INTO settings VALUES ('initialized', 'yes')").run();
  }
});

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new ApiError(status, message); }
function field(value, label, max = 140) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `Поле «${label}» должно содержать от 1 до ${max} символов.`);
  return value.trim();
}
function option(value, allowed) {
  if (!allowed.includes(value)) fail(400, 'Недопустимое значение статуса или уровня значимости.');
  return value;
}
function number(value, label, min, max, integer = false) {
  if ((typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) ||
      !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max ||
      (integer && !Number.isInteger(Number(value)))) fail(400, `Проверьте поле «${label}».`);
  return Number(value);
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    fail(400, 'Укажите корректную дату.');
  }
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) fail(400, 'Укажите дату и время по Москве.');
  date(value.slice(0, 10));
  const result = Date.parse(value + '+03:00');
  if (value.slice(11, 13) > '23' || !Number.isFinite(result)) fail(400, 'Укажите корректное время по Москве.');
  return result;
}
function get(table, id) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!row) fail(404, 'Запись не найдена.');
  return row;
}
const screenStatuses = ['В сети', 'Нет связи', 'Обслуживание'];
const campaignStatuses = ['Черновик', 'Активна', 'На паузе', 'Завершена'];
const mediaStatuses = ['На согласовании', 'Согласован'];
const taskStatuses = ['К выполнению', 'В работе', 'Готово'];
const riskLevels = ['Низкий', 'Средний', 'Высокий'];
const definitions = {
  screens: { label: 'Билборд', ref: 'screen_id', fields: v => {
    const resolution = field(v.resolution, 'Разрешение', 16).replace(/[xх×]/gi, '×').replace(/\s/g, '');
    if (!/^[1-9]\d{1,4}×[1-9]\d{1,4}$/.test(resolution)) fail(400, 'Укажите разрешение в формате 1920 × 1080.');
    return { name: field(v.name, 'Название'), address: field(v.address, 'Адрес', 250),
      lat: number(v.lat, 'Широта', -90, 90), lon: number(v.lon, 'Долгота', -180, 180),
      resolution, status: option(v.status, screenStatuses) };
  }},
  campaigns: { label: 'Кампания', ref: 'campaign_id', fields: v => ({
    name: field(v.name, 'Название'), customer: field(v.customer, 'Заказчик'),
    target: number(v.target, 'План показов', 1, 1000000000, true), status: option(v.status, campaignStatuses)
  }) },
  media: { label: 'Материал', ref: 'media_id', fields: v => ({
    name: field(v.name, 'Название'), status: option(v.status, mediaStatuses)
  }) },
  slots: { label: 'Слот', fields: (v, id) => {
    const screen = get('screens', number(v.screen_id, 'Билборд', 1, Number.MAX_SAFE_INTEGER, true));
    const campaign = get('campaigns', number(v.campaign_id, 'Кампания', 1, Number.MAX_SAFE_INTEGER, true));
    const material = get('media', number(v.media_id, 'Материал', 1, Number.MAX_SAFE_INTEGER, true));
    if (material.status !== 'Согласован') fail(400, 'Для слота нужен согласованный материал.');
    const starts = timestamp(v.starts), ends = timestamp(v.ends);
    const cycle = number(v.cycle, 'Цикл показа, сек.', 3, 120, true);
    if (starts >= ends) fail(400, 'Время окончания должно быть позже начала.');
    const collision = db.prepare('SELECT id FROM slots WHERE screen_id = ? AND starts < ? AND ends > ? AND id != ?').get(screen.id, ends, starts, id ?? 0);
    if (collision) fail(409, `У экрана «${screen.name}» уже есть слот в этом интервале. Выберите другое время.`);
    return { screen_id: screen.id, campaign_id: campaign.id, media_id: material.id, starts, ends, cycle };
  }},
  tasks: { label: 'Задача', fields: v => ({
    name: field(v.name, 'Название'), owner: field(v.owner, 'Ответственный'),
    due: date(v.due), status: option(v.status, taskStatuses)
  }) },
  risks: { label: 'Риск', fields: v => ({
    name: field(v.name, 'Название'), severity: option(v.severity, riskLevels),
    response: field(v.response, 'Меры реагирования', 2000)
  }) }
};
function objectName(table, row) {
  return definitions[table].label + ' · ' + (table === 'slots' ? get('screens', row.screen_id).name : row.name);
}
function audit(actor, action, object) {
  db.prepare('INSERT INTO audit(at,actor,action,object) VALUES(?,?,?,?)').run(Date.now(), actor, action, object);
}

const joined = `SELECT s.*, sc.name AS screen, sc.address, sc.status AS screen_status, c.name AS campaign,
  c.status AS campaign_status, m.name AS media, m.status AS media_status, m.mime, m.file
  FROM slots s JOIN screens sc ON sc.id = s.screen_id
  JOIN campaigns c ON c.id = s.campaign_id JOIN media m ON m.id = s.media_id`;
const eligible = "sc.status = 'В сети' AND c.status = 'Активна' AND m.status = 'Согласован'";
const campaignRows = `SELECT c.*, (SELECT COUNT(*) FROM slots WHERE campaign_id = c.id) AS slots,
  (SELECT COUNT(*) FROM events WHERE campaign_id = c.id) AS impressions FROM campaigns c ORDER BY c.id DESC`;
function dayStart(now) { return Math.floor((now + MOSCOW) / DAY) * DAY - MOSCOW; }
function timeline(now) {
  const start = dayStart(now) - 6 * DAY;
  const query = db.prepare('SELECT COUNT(*) AS count FROM events WHERE at >= ? AND at < ?');
  return Array.from({length: 7}, (_, index) => {
    const time = start + index * DAY;
    return { time, count: query.get(time, time + DAY).count };
  });
}
function dashboard() {
  const now = Date.now();
  const summary = db.prepare("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'В сети') AS online, COUNT(*) FILTER (WHERE status = 'Нет связи') AS offline, COUNT(*) FILTER (WHERE status = 'Обслуживание') AS maintenance FROM screens").get();
  const current = db.prepare(joined + ` WHERE ${eligible} AND s.starts <= ? AND s.ends > ? ORDER BY sc.name`).all(now, now);
  return { ...summary, active: current.length, today: db.prepare('SELECT COUNT(*) AS count FROM events WHERE at >= ? AND at <= ?').get(dayStart(now), now).count,
    now, current, latest: db.prepare('SELECT * FROM events ORDER BY at DESC, id DESC LIMIT 5').all(), timeline: timeline(now) };
}
function list(table) {
  if (table === 'campaigns') return db.prepare(campaignRows).all();
  if (table === 'slots') return db.prepare(joined + ' ORDER BY s.starts, s.id').all();
  return db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all();
}
function playlist(id, now) {
  const slot = db.prepare(joined + ` WHERE s.screen_id = ? AND ${eligible} AND s.starts <= ? AND s.ends > ?`).get(id, now, now);
  if (!slot) return null;
  const duration = slot.cycle * 1000;
  return { ...slot, cycleStart: slot.starts + Math.floor((now - slot.starts) / duration) * duration, url: '/media/' + slot.file };
}
function impression(input) {
  const now = Date.now();
  const screenId = number(input.screen_id, 'Билборд', 1, Number.MAX_SAFE_INTEGER, true);
  const slotId = number(input.slot_id, 'Слот', 1, Number.MAX_SAFE_INTEGER, true);
  const cycleStart = number(input.cycle_start, 'Цикл', 1, Number.MAX_SAFE_INTEGER, true);
  const existing = db.prepare('SELECT 1 FROM events WHERE slot_id = ? AND cycle_start = ? AND screen_id = ?').get(slotId, cycleStart, screenId);
  if (existing) return { registered: false };
  const slot = db.prepare(joined + ` WHERE s.id = ? AND s.screen_id = ? AND ${eligible}`).get(slotId, screenId);
  const cycleEnd = slot ? cycleStart + slot.cycle * 1000 : 0;
  if (!slot || cycleStart < slot.starts || (cycleStart - slot.starts) % (slot.cycle * 1000) !== 0 ||
      cycleEnd > slot.ends || now < cycleEnd || now - cycleEnd > 15000) fail(409, 'Цикл больше не доступен для регистрации.');
  const added = db.prepare(`INSERT OR IGNORE INTO events(at,slot_id,cycle_start,screen_id,campaign_id,media_id,screen,campaign,media)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(now, slot.id, cycleStart, slot.screen_id, slot.campaign_id, slot.media_id, slot.screen, slot.campaign, slot.media);
  return { registered: Boolean(added.changes) };
}

function reportRows(params) {
  const id = params.get('screen');
  const query = (params.get('q') || '').trim().toLocaleLowerCase('ru');
  const rows = id ? db.prepare('SELECT * FROM events WHERE screen_id = ? ORDER BY at DESC, id DESC').iterate(Number(id)) :
    db.prepare('SELECT * FROM events ORDER BY at DESC, id DESC').iterate();
  return Array.from(rows).filter(row => !query || [row.screen,row.campaign,row.media].some(value => value.toLocaleLowerCase('ru').includes(query)));
}
function csv(rows) {
  const cell = value => {
    let str = String(value);
    if (/^[\s]*[=+@-]|^[\t\r\n]/.test(str)) str = "'" + str;
    return '"' + str.replaceAll('"', '""') + '"';
  };
  const format = new Intl.DateTimeFormat('ru-RU', { timeZone:'Europe/Moscow', dateStyle:'short', timeStyle:'medium' });
  return '\uFEFF' + [['Время (МСК)', 'Экран', 'Кампания', 'Материал'], ...rows.map(r => [format.format(r.at), r.screen, r.campaign, r.media])]
    .map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function read(req, max = 65536) {
  if (Number(req.headers['content-length']) > max) fail(413, max === MAX_SIZE ? 'Размер файла превышает 30 МБ.' : 'Запрос слишком большой.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= max) chunks.push(chunk);
  }
  if (size > max) fail(413, 'Размер запроса превышает допустимый.');
  return Buffer.concat(chunks);
}
async function input(req) {
  const body = await read(req);
  try {
    const value = JSON.parse(body);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* handled below */ }
  fail(400, 'Не удалось прочитать данные формы.');
}
const formats = {
  '.png': ['image/png', 'PNG'], '.jpg': ['image/jpeg', 'JPEG'], '.jpeg': ['image/jpeg', 'JPEG'],
  '.webp': ['image/webp', 'WEBP'], '.mp4': ['video/mp4', 'MP4'], '.webm': ['video/webm', 'WEBM']
};
function removeFile(path) {
  try { unlinkSync(path); }
  catch (error) { if (error.code !== 'ENOENT') console.error(error); }
}
async function upload(req, params, actor) {
  const original = field(params.get('filename'), 'Имя файла', 250);
  const extension = extname(original).toLowerCase();
  const format = formats[extension];
  if (!format) fail(415, 'Загрузите PNG, JPEG, WebP, MP4 или WebM.');
  const [mime, expected] = format;
  const claimed = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (claimed && claimed !== 'application/octet-stream' && claimed !== mime) fail(415, 'Тип файла не соответствует его расширению.');
  const name = field(params.get('name') || original.slice(0, -extension.length), 'Название');
  const body = await read(req, MAX_SIZE);
  if (!body.length) fail(400, 'Выбран пустой файл.');
  const file = randomUUID() + extension;
  const path = join(uploads, file);
  try {
    await writeFile(path, body, { flag: 'wx' });
    try {
      await run(process.env.BAMBOLBI_PYTHON, [join(root, 'validate_media.py'), path, expected], { timeout: 20000, windowsHide: true });
    } catch (error) {
      if (error.code === 3) fail(503, 'Для проверки видео установите FFmpeg (ffprobe) на сервере.');
      if (error.code === 2) fail(415, 'Файл повреждён или его содержимое не соответствует заявленному формату.');
      if (error.killed) fail(422, 'Проверка файла заняла слишком много времени. Попробуйте загрузить другой файл.');
      throw error;
    }
    return transaction(() => {
      const id = put('media', { name, file, mime, size: body.length, status: 'На согласовании' });
      audit(actor, 'Загрузил', objectName('media', get('media', id)));
      return { id };
    });
  } catch (error) {
    removeFile(path);
    throw error;
  }
}
async function serveMedia(req, res, file) {
  const media = db.prepare('SELECT * FROM media WHERE file = ?').get(file);
  if (!media) fail(404, 'Файл не найден.');
  const headers = { 'Content-Type': media.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' };
  const size = media.size;
  let start = 0, end = size - 1, status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
    }
    if (!match || !(match[1] || match[2]) || start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size }).end();
      return;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  await pipeline(createReadStream(join(uploads, file), { start, end }), res);
}
async function handle(req, res) {
  if (req.headers['x-internal-token'] !== token) fail(403, 'Доступ запрещён.');
  const url = new URL(req.url, 'http://localhost');
  const method = req.method;
  const actor = decodeURIComponent(req.headers['x-actor'] || 'Администратор');
  if (url.pathname.startsWith('/media/') && (method === 'GET' || method === 'HEAD')) return serveMedia(req, res, url.pathname.slice(7));
  const [, prefix, table, rawId, extra] = url.pathname.split('/');
  if (prefix !== 'api' || extra !== undefined) fail(404, 'Страница не найдена.');
  if (method === 'GET' && table === 'dashboard') return json(res, 200, dashboard());
  if (method === 'GET' && table === 'playlist') {
    const screen = get('screens', number(url.searchParams.get('screen'), 'Билборд', 1, Number.MAX_SAFE_INTEGER, true));
    const now = Date.now();
    return json(res, 200, { screen, now, slot: playlist(screen.id, now) });
  }
  if (method === 'POST' && table === 'impressions') return json(res, 200, impression(await input(req)));
  if (method === 'GET' && table === 'report') {
    const rows = reportRows(url.searchParams);
    if (rawId === 'csv') {
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="bambolbi-impressions.csv"', 'Cache-Control': 'no-store' });
      return res.end(csv(rows));
    }
    const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
    return json(res, 200, { timeline: timeline(Date.now()), campaigns: db.prepare(campaignRows).all(),
      events: url.searchParams.get('print') === '1' ? rows : rows.slice((page - 1) * 20, page * 20), total: rows.length });
  }
  if (method === 'GET' && table === 'audit') return json(res, 200, db.prepare('SELECT * FROM audit ORDER BY at DESC, id DESC').all());
  if (!Object.hasOwn(definitions, table)) fail(404, 'Страница не найдена.');
  if (method === 'GET' && !rawId) return json(res, 200, list(table));
  if (method === 'POST' && !rawId && table === 'media') return json(res, 201, await upload(req, url.searchParams, actor));
  const spec = definitions[table];
  if (method === 'DELETE' && rawId) {
    const row = transaction(() => {
      const id = number(rawId, 'Запись', 1, Number.MAX_SAFE_INTEGER, true);
      const current = get(table, id);
      if (spec.ref && db.prepare(`SELECT 1 FROM slots WHERE ${spec.ref} = ? LIMIT 1`).get(id)) {
        fail(409, 'Запись используется в расписании. Сначала удалите связанные слоты.');
      }
      const object = objectName(table, current);
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      audit(actor, 'Удалил', object);
      return current;
    });
    if (table === 'media') removeFile(join(uploads, row.file));
    return json(res, 200, { id: row.id });
  }
  if ((method === 'POST' && !rawId) || (method === 'PATCH' && rawId)) {
    const submitted = await input(req);
    const id = transaction(() => {
      if (method === 'POST') {
        const newId = put(table, spec.fields(submitted));
        audit(actor, 'Создал', objectName(table, get(table, newId)));
        return newId;
      }
      const id = number(rawId, 'Запись', 1, Number.MAX_SAFE_INTEGER, true);
      const current = get(table, id);
      const values = spec.fields(submitted, id);
      const columns = Object.keys(values).map(key => key + ' = ?').join(', ');
      db.prepare(`UPDATE ${table} SET ${columns} WHERE id = ?`).run(...Object.values(values), id);
      const approved = table === 'media' && current.status !== 'Согласован' && values.status === 'Согласован';
      audit(actor, approved ? 'Согласовал' : 'Изменил', objectName(table, { ...current, ...values }));
      return id;
    });
    return json(res, method === 'POST' ? 201 : 200, { id });
  }
  fail(405, 'Операция недоступна.');
}
const server = http.createServer((req, res) => {
  handle(req, res).catch(error => {
    if (!error.status && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error(error);
    if (res.headersSent) return res.destroy();
    json(res, error.status || 500, { error: error.status ? error.message : 'Не удалось выполнить операцию.' });
  });
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
process.stdin.on('end', () => server.close());
process.stdin.resume();
