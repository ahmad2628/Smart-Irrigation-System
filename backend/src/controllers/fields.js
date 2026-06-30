import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireFields } from '../utils/validate.js';
import {
  listFieldsByUser, findFieldById, createField, updateField, deleteField,
} from '../repositories/fields.js';
import { logActivity } from '../repositories/activityLogs.js';

async function loadOwnedField(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid field id');
  const field = await findFieldById(id);
  if (!field) throw new HttpError(404, 'Field not found');
  if (field.user_id !== req.user.id && req.user.role !== 'admin') {
    throw new HttpError(403, 'Not your field');
  }
  return field;
}

export const list = asyncHandler(async (req, res) => {
  res.json({ fields: await listFieldsByUser(req.user.id) });
});

export const create = asyncHandler(async (req, res) => {
  requireFields(req.body, ['name']);
  const { name, size_acres, soil_type, location } = req.body;
  const field = await createField({
    userId: req.user.id,
    name,
    sizeAcres: size_acres,
    soilType: soil_type,
    location,
  });
  await logActivity({
    userId: req.user.id, action: 'create', entity: 'field', entityId: field.id,
    details: { name },
  });
  res.status(201).json({ field });
});

export const get = asyncHandler(async (req, res) => {
  const field = await loadOwnedField(req);
  res.json({ field });
});

export const update = asyncHandler(async (req, res) => {
  const field = await loadOwnedField(req);
  const { name, size_acres, soil_type, location } = req.body;
  const updated = await updateField(field.id, {
    name, sizeAcres: size_acres, soilType: soil_type, location,
  });
  await logActivity({
    userId: req.user.id, action: 'update', entity: 'field', entityId: field.id,
  });
  res.json({ field: updated });
});

export const remove = asyncHandler(async (req, res) => {
  const field = await loadOwnedField(req);
  await deleteField(field.id);
  await logActivity({
    userId: req.user.id, action: 'delete', entity: 'field', entityId: field.id,
  });
  res.status(204).send();
});
