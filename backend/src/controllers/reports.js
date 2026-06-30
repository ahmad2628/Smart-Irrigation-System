import PDFDocument from 'pdfkit';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { toCsv } from '../utils/csv.js';
import {
  eventCountsByTrigger, eventCountsByStatus, eventsPerDay,
  readingStats, eventsForCsv, readingsForCsv,
} from '../repositories/reports.js';
import { findZoneById } from '../repositories/zones.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRange(req) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const from = req.query.from || defaultFrom;
  const to   = req.query.to   || today;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new HttpError(400, 'from/to must be YYYY-MM-DD');
  }
  if (from > to) throw new HttpError(400, 'from must be <= to');
  return { from, to };
}

async function resolveZone(req) {
  const id = req.query.zone_id ? Number(req.query.zone_id) : null;
  if (id == null) return null;
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid zone_id');
  const zone = await findZoneById(id);
  if (!zone) throw new HttpError(404, 'Zone not found');
  if (zone.owner_id !== req.user.id && req.user.role !== 'admin') {
    throw new HttpError(403, 'Not your zone');
  }
  return zone;
}

export const summary = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  const zone = await resolveZone(req);
  const scope = { userId: req.user.id, zoneId: zone?.id, from, to };

  const [byTrigger, byStatus, perDay, readings] = await Promise.all([
    eventCountsByTrigger(scope),
    eventCountsByStatus(scope),
    eventsPerDay(scope),
    readingStats(scope),
  ]);

  const totalEvents = byTrigger.reduce((sum, r) => sum + Number(r.count), 0);
  const totalDurationSec = byTrigger.reduce((sum, r) => sum + Number(r.total_duration_sec || 0), 0);

  res.json({
    from, to,
    zone: zone ? { id: zone.id, name: zone.name } : null,
    totals: {
      events: totalEvents,
      duration_sec: totalDurationSec,
      duration_minutes: Math.round(totalDurationSec / 60),
    },
    by_trigger: byTrigger,
    by_status:  byStatus,
    per_day:    perDay,
    readings,
  });
});

export const irrigationCsv = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  const zone = await resolveZone(req);
  const rows = await eventsForCsv({ userId: req.user.id, zoneId: zone?.id, from, to });
  const csv = toCsv(rows, ['id','zone','field','triggered_by','status','reason','start_time','end_time','duration_sec','water_liters']);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="irrigation_${from}_${to}.csv"`);
  res.send(csv);
});

export const readingsCsv = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  const zone = await resolveZone(req);
  const rows = await readingsForCsv({ userId: req.user.id, zoneId: zone?.id, from, to });
  const csv = toCsv(rows, ['id','zone','field','moisture_pct','humidity_pct','water_level','temperature_c','recorded_at']);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="readings_${from}_${to}.csv"`);
  res.send(csv);
});

export const summaryPdf = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  const zone = await resolveZone(req);
  const scope = { userId: req.user.id, zoneId: zone?.id, from, to };

  const [byTrigger, byStatus, perDay, readings] = await Promise.all([
    eventCountsByTrigger(scope),
    eventCountsByStatus(scope),
    eventsPerDay(scope),
    readingStats(scope),
  ]);
  const totalEvents = byTrigger.reduce((sum, r) => sum + Number(r.count), 0);
  const totalDurationSec = byTrigger.reduce((sum, r) => sum + Number(r.total_duration_sec || 0), 0);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="irrigation_report_${from}_${to}.pdf"`);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  // Header
  doc.fontSize(22).fillColor('#0d6efd').text('Smart Irrigation Report', { align: 'left' });
  doc.fontSize(11).fillColor('#666').text(`Period: ${from} to ${to} (UTC)`, { continued: false });
  doc.text(`User: ${req.user.email}`);
  if (zone) doc.text(`Zone: ${zone.name}`);
  doc.text(`Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
  doc.moveDown();

  // Totals box
  doc.fillColor('#000').fontSize(14).text('Summary', { underline: true });
  doc.fontSize(11).moveDown(0.3);
  doc.text(`Total irrigation events: ${totalEvents}`);
  doc.text(`Total irrigation time: ${Math.round(totalDurationSec / 60)} minutes`);
  doc.moveDown();

  // By trigger
  doc.fontSize(14).text('Events by trigger', { underline: true });
  doc.fontSize(11).moveDown(0.3);
  if (byTrigger.length === 0) {
    doc.fillColor('#666').text('— no events in this period —');
    doc.fillColor('#000');
  } else {
    byTrigger.forEach((r) => {
      doc.text(`  • ${r.triggered_by.padEnd(10)} ${String(r.count).padStart(4)} events · ${Math.round(Number(r.total_duration_sec || 0) / 60)} min`);
    });
  }
  doc.moveDown();

  // By status
  doc.fontSize(14).text('Events by status', { underline: true });
  doc.fontSize(11).moveDown(0.3);
  if (byStatus.length === 0) {
    doc.fillColor('#666').text('— no events in this period —'); doc.fillColor('#000');
  } else {
    byStatus.forEach((r) => doc.text(`  • ${r.status.padEnd(10)} ${r.count}`));
  }
  doc.moveDown();

  // Reading stats
  doc.fontSize(14).text('Sensor readings', { underline: true });
  doc.fontSize(11).moveDown(0.3);
  doc.text(`Total readings: ${readings.readings_count || 0}`);
  if (readings.readings_count) {
    doc.text(`Moisture (avg / min / max): ${readings.avg_moisture}% / ${readings.min_moisture}% / ${readings.max_moisture}%`);
    doc.text(`Humidity (avg):              ${readings.avg_humidity}%`);
    doc.text(`Water level (avg):           ${readings.avg_water_level}%`);
  }
  doc.moveDown();

  // Daily breakdown table
  doc.fontSize(14).text('Daily irrigation', { underline: true });
  doc.fontSize(10).moveDown(0.3);
  if (perDay.length === 0) {
    doc.fillColor('#666').text('— no events in this period —'); doc.fillColor('#000');
  } else {
    doc.text('Day            Events    Total minutes');
    doc.text('-----------    ------    -------------');
    perDay.forEach((r) => {
      const day = String(r.day).slice(0, 10);
      doc.text(`${day}     ${String(r.count).padStart(6)}    ${String(Math.round(Number(r.duration_sec || 0) / 60)).padStart(13)}`);
    });
  }

  doc.moveDown(2);
  doc.fontSize(9).fillColor('#999').text('Generated by IoT-Based Smart Irrigation System', { align: 'center' });

  doc.end();
});
