import { Stroke } from '../segmentation/Stroke.js';

const DATABASE = 'calcink-notebook';
const KEY = 'current';

export function blankPage(number, width = 1100, height = 800) {
  return { id: crypto.randomUUID(), title: `Page ${number}`, width, height, strokes: [], corrections: [] };
}

export function newNotebook() {
  const page = blankPage(1);
  return { schema: 1, activePageId: page.id, pages: [page] };
}

export function serializeStrokes(strokes) {
  return strokes.map(stroke => ({
    id: stroke.id, color: stroke.color, width: stroke.width,
    points: stroke.points.map(({ x, y, pressure }) => ({ x, y, pressure }))
  }));
}

export function hydrateStrokes(data) {
  return data.map(item => {
    const stroke = new Stroke(item.id);
    stroke.color = item.color;
    stroke.width = item.width;
    item.points.forEach(point => stroke.addPoint(point.x, point.y, point.pressure));
    return stroke;
  });
}

export function validateNotebook(value) {
  if (value?.schema !== 1 || !Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > 100) {
    throw new Error('This is not a CalcInk notebook.');
  }
  let totalPoints = 0;
  const ids = new Set();
  for (const page of value.pages) {
    if (typeof page.id !== 'string' || ids.has(page.id) ||
        typeof page.title !== 'string' || page.title.length > 80 ||
        !Number.isFinite(page.width) || !Number.isFinite(page.height) ||
        page.width < 300 || page.width > 5000 || page.height < 300 || page.height > 5000 ||
        !Array.isArray(page.strokes) || page.strokes.length > 10000 || !Array.isArray(page.corrections)) {
      throw new Error('This notebook has an invalid page.');
    }
    ids.add(page.id);
    for (const stroke of page.strokes) {
      if (!Number.isFinite(stroke.id) || !Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 30 ||
          typeof stroke.color !== 'string' || !Array.isArray(stroke.points) || !stroke.points.length) {
        throw new Error('This notebook has an invalid stroke.');
      }
      totalPoints += stroke.points.length;
      if (totalPoints > 500000 || stroke.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
          !Number.isFinite(p.pressure) || Math.abs(p.x) > 10000 || Math.abs(p.y) > 10000)) {
        throw new Error('This notebook has invalid drawing points.');
      }
    }
    if (page.corrections.length > 10000 || page.corrections.some(pair => !Array.isArray(pair) ||
        pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string')) {
      throw new Error('This notebook has invalid corrections.');
    }
  }
  if (!ids.has(value.activePageId)) throw new Error('This notebook has no selected page.');
  return value;
}

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadNotebook() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('data').objectStore('data').get(KEY);
      request.onsuccess = () => {
        try { resolve(request.result ? validateNotebook(request.result) : newNotebook()); }
        catch (error) { reject(error); }
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function saveNotebook(book) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('data', 'readwrite');
      transaction.objectStore('data').put(book, KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
