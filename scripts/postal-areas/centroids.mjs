// Builds src/assets/postal-centroids.json from the maps of build.py, for the search of
// bazaars around a place: per country the middle of every area (first three digits) and
// region (first two) as latitude and longitude, and places by name: the towns of the map,
// then the places an area is named after. Run: node scripts/postal-areas/centroids.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const R = 63710;
const dir = new URL('../../src/assets/postal-areas/', import.meta.url);
const round = (value) => Math.round(value * 100) / 100;
const unproject = ([x, y]) => [
  round(((2 * Math.atan(Math.exp(-y / R)) - Math.PI / 2) * 180) / Math.PI),
  round(((x / R) * 180) / Math.PI),
];

const result = {};
for (const file of readdirSync(dir).sort()) {
  const map = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  const points = {};
  for (const area of [...map.regions, ...map.areas]) {
    // On maps of several countries `l` is the prefix, `p` the key "AT:690"
    points[area.l ?? area.p] = unproject(area.c);
  }
  const places = {};
  for (const town of map.towns) places[town.n] ??= unproject(town.c);
  for (const area of map.areas) {
    for (const name of area.n ?? []) places[name] ??= unproject(area.c);
  }
  result[map.country] = { codes: points, places };
}
writeFileSync(
  new URL('../../src/assets/postal-centroids.json', import.meta.url),
  JSON.stringify(result) + '\n'
);
