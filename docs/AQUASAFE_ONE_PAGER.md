# AquaSafe — One-Pager (Interview Prep & Understanding)

Use this to speak confidently about the project: architecture, data flow, tools, and implementation details.

---

## What AquaSafe Does (Elevator Pitch)

**AquaSafe** is a full-stack web app that answers: *Which reservoir supplies this area, and is that source (or nearby power plants, refineries, nuclear sites) in a disaster zone?* Users click the map to get a **0–100 water-safety risk score**, see nearby disasters (FEMA), their possible water source (reservoir), hazardous facilities at risk, and a list of nearby drinking water points (OpenStreetMap). They can also report safe water sources (persisted in SQLite) and submit problem reports (with optional AI urgency classification).

---

## Stack at a Glance

| Layer | Tech | What it’s used for |
|-------|------|--------------------|
| **Frontend** | React 18, TypeScript, Vite | SPA; type-safe UI and API contracts |
| **Map** | Leaflet, react-leaflet | Interactive map, markers, circles, click-to-select |
| **Styling** | Tailwind CSS | Layout, responsive grid, legend, panels |
| **Backend** | Express, TypeScript | REST API; routes, CORS, JSON body/query |
| **Runtime** | Node (tsx for dev) | ESM; dotenv for env vars |
| **Data** | OpenFEMA (HTTP), Overpass (OSM), demo JSON | Disasters, drinking water points; reservoirs/facilities from static data |
| **Persistence** | better-sqlite3 (or in-memory fallback) | User reports, safe-water reports, optional WQP cache |
| **AI (optional)** | OpenAI API (gpt-4o-mini) | One-sentence risk summary; report urgency classification |

---

## API Endpoints (Backend)

| Method | Path | Purpose |
|--------|------|--------|
| GET | `/api/health` | Liveness; returns `{ ok: true, service: "AquaSafe API" }` |
| GET | `/api/ai-status` | Whether `OPENAI_API_KEY` is set; used by frontend to show AI on/off |
| GET | `/api/fema?limit=N` | FEMA disaster declarations (from OpenFEMA), with state centroids for lat/lng |
| GET | `/api/risk?lat=&lng=` | **Core**: risk score 0–100, explanation, reservoir, facilities at risk, optional AI sentence |
| GET | `/api/water/nearby?lat=&lng=&limit=` | Nearby drinking water points from OpenStreetMap (Overpass) |
| GET | `/api/safe-water?lat=&lng=&radius_km=&limit=` | User-reported safe water sources (from DB), optionally filtered by distance |
| POST | `/api/safe-water` | Submit a safe water report (lat, lng, optional name) → SQLite / in-memory |
| GET | `/api/reports?limit=` | List recent problem reports (for map/feed) |
| POST | `/api/reports` | Submit problem report (description, lat, lng); optional OpenAI urgency (low/medium/high/critical) |

---

## Core Data Flow: “Click Map → Risk Score”

1. **User clicks map** → React-Leaflet `useMapEvents` captures `(lat, lng)`.
2. **Frontend** calls `GET /api/risk?lat=...&lng=...`.
3. **Backend** (`routes/risk.ts`):
   - Fetches **disasters** (FEMA, 100 most recent).
   - Resolves **reservoir** for point (nearest within 250 km from demo `reservoirs.ts`).
   - Resolves **facilities** near point (within 120 km from demo `facilities.ts`).
   - Calls **`computeRiskScore()`** (heuristic, no AI):
     - Start at 100; subtract penalties for: disasters within 50 km of point, disaster within 50 km of source reservoir, disasters within 50 km of facilities (capped).
   - Optionally calls **`getAiExplanation()`** with score + heuristic explanation → one short sentence from OpenAI.
4. **Response** includes: `score`, `explanation`, `explanationFromAi`, `nearbyDisasters`, `reservoir`, `sourceReservoirInDisasterZone`, `facilitiesAtRisk`.
5. **Frontend** shows score, explanation, AI sentence (if present), reservoir info, facilities at risk, and option to load “nearby safe water” (which hits `/api/water/nearby`).

---

## Where the Score Comes From (Heuristic, Not AI)

- **File:** `server/src/services/riskScoreService.ts`
- **Logic:** Start at 100. Apply penalties:
  - **Disasters near clicked point:** each distinct disaster within 50 km → −25 (by `disasterNumber` + state to dedupe).
  - **Source reservoir in disaster zone:** if the nearest reservoir (within 250 km) has any disaster within 50 km → −15.
  - **Facilities at risk:** each facility (power/nuclear/refinery) that has a disaster within 50 km → −10 each, **capped at 20** (2 facilities).
- **Distance:** Haversine formula (Earth radius 6371 km) for all “within 50 km” checks.
- **Output:** `score` (0–100), text `explanation`, plus `nearbyDisasters`, `reservoir`, `sourceReservoirInDisasterZone`, `facilitiesAtRisk` for the UI.

---

## Where AI Is Used (Optional)

1. **Risk explanation (one sentence)**  
   - **File:** `server/src/services/aiExplanation.ts`  
   - **Trigger:** After `computeRiskScore()`, if `OPENAI_API_KEY` is set.  
   - **Input:** score, heuristic explanation text, lat/lng.  
   - **Output:** Single short user-facing sentence (e.g. “Your area’s water source is not in a current disaster zone; check local advisories.”).  
   - **Fallback:** If no key or API error → `explanationFromAi: null`; UI still shows heuristic explanation.

2. **Report urgency**  
   - **File:** `server/src/services/urgencyService.ts`  
   - **Trigger:** On `POST /api/reports` (user submits problem description).  
   - **Output:** `low` | `medium` | `high` | `critical` from GPT-4o-mini; stored with the report.  
   - **Fallback:** No key or error → `medium`.

---

## External Data Sources

| Source | Use | Key detail |
|--------|-----|------------|
| **OpenFEMA** | Disaster declarations | No API key. `$top`, `$orderby=declarationDate desc`. No lat/lng in API → we use **state centroids** (hardcoded in `fema.ts`) for map and distance. |
| **Overpass (OSM)** | Drinking water points | Query `node["amenity"="drinking_water"]` in bbox; categorize as fountain/tap/refill/other from tags. |
| **Demo data** | Reservoirs, facilities | `server/src/data/reservoirs.ts`, `facilities.ts` (static arrays). Production would use EPA FRS, EIA, NRC, or state water data. |

---

## Frontend Tidbits

- **Map:** Leaflet `MapContainer`, `TileLayer` (OSM tiles), `Circle` (50 km radius around each FEMA disaster), `Marker` (disasters = red, water = blue, user safe = green).
- **Click:** `MapClickHandler` component with `useMapEvents({ click })` → calls `handleLocationSelect(lat, lng)` → fetches `/api/risk` and updates state.
- **Proxying:** In dev, Vite proxies `/api/*` to the Express server (e.g. 5001) so the client uses relative URLs like `/api/risk`.
- **Health check:** On load, `fetch('/api/health')` and optionally `/api/ai-status` to show “API connected” and “AI configured” in the UI.

---

## Database (SQLite)

- **Tables:** `reports` (problem reports), `safe_water_reports` (user-reported safe water), plus optional `wqp_cache`, `water_quality_weights`, `water_quality_training` for future use.
- **Fallback:** If `better-sqlite3` isn’t available (e.g. Windows without build tools), in-memory stores are used so the app still runs.

---

## Good Interview Sound Bites

- “The **risk score is heuristic**: we combine FEMA disasters, whether the area’s water source reservoir is in a disaster zone, and whether hazardous facilities are in a disaster zone. **AI is optional**: we use OpenAI to generate one short summary sentence and to classify report urgency.”
- “We used **OpenFEMA** (no key) for disasters; since it doesn’t give coordinates, we mapped declarations to **state centroids** for distance calculations and map display.”
- “**Nearby water** comes from **OpenStreetMap’s Overpass API** — we query for `amenity=drinking_water` in a bounding box and sort by Haversine distance.”
- “The backend is **Express + TypeScript** with a clear split: routes handle HTTP, services handle FEMA, risk scoring, reservoirs, facilities, and AI. The frontend is **React + Leaflet** with Tailwind; map click drives the main flow to the risk API.”
- “We support **graceful degradation**: no OpenAI key → heuristic explanation and default urgency; no SQLite → in-memory stores so the app still runs.”

---

## File Map (Where to Look)

| Concern | File(s) |
|--------|--------|
| Risk score logic | `server/src/services/riskScoreService.ts` |
| Risk API | `server/src/routes/risk.ts` |
| FEMA fetch + state coords | `server/src/services/fema.ts` |
| Disasters for risk | `server/src/services/disasters.ts` |
| Reservoir for point | `server/src/services/reservoirs.ts`, `server/src/data/reservoirs.ts` |
| Facilities near point | `server/src/services/facilities.ts`, `server/src/data/facilities.ts` |
| Nearby water (OSM) | `server/src/services/waterPoints.ts` |
| AI risk sentence | `server/src/services/aiExplanation.ts` |
| AI urgency | `server/src/services/urgencyService.ts` |
| Safe water CRUD | `server/src/routes/safeWater.ts`, `server/src/db.ts` |
| App entry, routes | `server/src/index.ts` |
| Map + risk UI | `client/src/App.tsx` |

---

*Keep this doc next to the repo so you can quickly recall flows and tools before interviews or when updating your resume.*
