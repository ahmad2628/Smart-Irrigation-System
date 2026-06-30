import { asyncHandler } from '../utils/asyncHandler.js';
import { listCrops } from '../repositories/crops.js';

export const list = asyncHandler(async (req, res) => {
  res.json({ crops: await listCrops() });
});
