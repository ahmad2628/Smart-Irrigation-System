import { asyncHandler } from '../utils/asyncHandler.js';
import { getCurrentWeather, getForecast } from '../services/weather.js';

export const current = asyncHandler(async (req, res) => {
  const result = await getCurrentWeather(req.query.city);
  res.json(result);
});

export const forecast = asyncHandler(async (req, res) => {
  const hours = req.query.hours ? Number(req.query.hours) : 24;
  const result = await getForecast(req.query.city, hours);
  res.json(result);
});
