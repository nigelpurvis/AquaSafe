import { MapContainer, TileLayer, useMapEvents, Marker, Popup, Circle } from 'react-leaflet';
import { useState, useEffect } from 'react';
import L from 'leaflet';

// Blue = default (water). Red = disasters (FEMA).
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
const redIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
const greenIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006];
const DEFAULT_ZOOM = 10;

function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

type SafeWaterPoint = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  category?: 'fountain' | 'tap' | 'refill' | 'other';
  distanceKm: number;
  type?: string;
};

type FemaItem = {
  id: string | number;
  title: string;
  state: string;
  lat: number;
  lng: number;
  type?: string;
  date?: string | null;
  declarationDate?: string | null;
};

function MapClickHandler({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

type UserSafeWaterReport = {
  id: number;
  lat: number;
  lng: number;
  name: string;
  created_at: string;
  distanceKm?: number;
};

type NearbyDisaster = { id: string; title?: string; state?: string; type?: string; count?: number };
type ReservoirInfo = { reservoir: { name: string; state: string; serves?: string[] }; distanceKm: number };
type FacilityAtRisk = { id: string; name: string; state: string; type: string; distanceKm: number };
export default function App() {
  const [risk, setRisk] = useState<{
    score: number;
    explanation: string;
    explanationFromAi: string | null;
    nearbyDisasters: NearbyDisaster[];
    reservoir: ReservoirInfo | null;
    sourceReservoirInDisasterZone: boolean;
    facilitiesAtRisk: FacilityAtRisk[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastClicked, setLastClicked] = useState<{ lat: number; lng: number } | null>(null);
  const [safeWater, setSafeWater] = useState<SafeWaterPoint[] | null>(null);
  const [loadingSafeWater, setLoadingSafeWater] = useState(false);
  const [safeWaterError, setSafeWaterError] = useState<string | null>(null);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [femaItems, setFemaItems] = useState<FemaItem[]>([]);
  const [reportSent, setReportSent] = useState<string | null>(null);
  const [userSafeWater, setUserSafeWater] = useState<UserSafeWaterReport[]>([]);
  const [reportSafeWaterSubmitting, setReportSafeWaterSubmitting] = useState(false);
  const [reportSafeWaterDone, setReportSafeWaterDone] = useState(false);

  const fetchUserSafeWater = (centerLat?: number, centerLng?: number) => {
    const lat = centerLat ?? DEFAULT_CENTER[0];
    const lng = centerLng ?? DEFAULT_CENTER[1];
    fetch(`/api/safe-water?lat=${lat}&lng=${lng}&radius_km=80&limit=100`)
      .then((r) => r.json())
      .then((data: { reports: UserSafeWaterReport[] }) => setUserSafeWater(data.reports ?? []))
      .catch(() => setUserSafeWater([]));
  };

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.ok)
      .then(setBackendReachable)
      .catch(() => setBackendReachable(false));
  }, []);

  useEffect(() => {
    const load = () =>
      fetch('/api/fema?limit=250')
        .then((r) => r.json())
        .then((data: FemaItem[]) => setFemaItems(data))
        .catch(() => setFemaItems([]));

    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchUserSafeWater();
  }, []);

  const handleLocationSelect = async (lat: number, lng: number) => {
    setLastClicked({ lat, lng });
    setLoading(true);
    setRisk(null);
    setSafeWater(null);
    setSafeWaterError(null);
    try {
      const res = await fetch(`/api/risk?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (res.ok) setRisk({
        score: data.score,
        explanation: data.explanation,
        explanationFromAi: data.explanationFromAi ?? null,
        nearbyDisasters: data.nearbyDisasters ?? [],
        reservoir: data.reservoir ?? null,
        sourceReservoirInDisasterZone: data.sourceReservoirInDisasterZone ?? false,
        facilitiesAtRisk: data.facilitiesAtRisk ?? [],
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchNearbySafeWater = async (lat: number, lng: number) => {
    setLoadingSafeWater(true);
    setSafeWater(null);
    setSafeWaterError(null);
    try {
      const res = await fetch(`/api/water/nearby?lat=${lat}&lng=${lng}&limit=5`);
      const data = await res.json();
      if (res.ok) setSafeWater(data.points ?? []);
      else setSafeWaterError(data.error ?? 'Failed to load safe water points');
    } catch {
      setSafeWaterError("Couldn't reach the API. Make sure the backend is running.");
    } finally {
      setLoadingSafeWater(false);
    }
  };

  const handleFindSafeWaterNearMe = () => {
    if (!navigator.geolocation) {
      setSafeWaterError('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchNearbySafeWater(pos.coords.latitude, pos.coords.longitude),
      () => setSafeWaterError('Could not get your location. Check permissions or try "from this point".')
    );
  };

  const handleFindSafeWaterFromPoint = () => {
    if (lastClicked) fetchNearbySafeWater(lastClicked.lat, lastClicked.lng);
  };

  const handleReportSafeWaterHere = async () => {
    if (!lastClicked) return;
    setReportSafeWaterSubmitting(true);
    setReportSafeWaterDone(false);
    try {
      const res = await fetch('/api/safe-water', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: lastClicked.lat, lng: lastClicked.lng }),
      });
      if (res.ok) {
        setReportSafeWaterDone(true);
        fetchUserSafeWater(lastClicked.lat, lastClicked.lng);
        setTimeout(() => setReportSafeWaterDone(false), 4000);
      }
    } finally {
      setReportSafeWaterSubmitting(false);
    }
  };

  const handleReportProblem = async (p: SafeWaterPoint) => {
    const description = `Problem at water source: ${p.name} (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`;
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, lat: p.lat, lng: p.lng }),
      });
      if (res.ok) {
        setReportSent(p.id);
        setTimeout(() => setReportSent(null), 3000);
      }
    } catch {
      setReportSent(null);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-slate-800 text-white px-4 py-3 shadow flex items-center gap-4">
        <img src="/aquasafe-logo.png" alt="" className="h-14 w-14 object-contain shrink-0" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold">AquaSafe</h1>
          <p className="text-sm text-slate-300">Find safe water near you. Click the map for risk score, then get directions to the nearest source.</p>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2 p-2">
        <div className="md:col-span-2 relative rounded-lg overflow-hidden border border-gray-200">
          {/* Map legend */}
          <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow border border-gray-200 px-3 py-2 text-xs text-gray-700 flex flex-col gap-1">
            <span className="font-semibold text-gray-800">Legend</span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-4 bg-blue-500 rounded-sm" /> Water source
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-4 bg-red-500 rounded-sm" /> Disaster (FEMA)
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-4 bg-green-500 rounded-sm" /> User-reported safe water
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-red-500 bg-red-500/10" /> 50 km approximate radius
            </span>
          </div>
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {femaItems.map((d, i) => (
              <Circle
                key={`circle-${d.id}-${d.state}-${d.declarationDate ?? d.date ?? i}`}
                center={[d.lat, d.lng]}
                radius={50000}
                pathOptions={{
                  color: '#dc2626',
                  fillColor: '#dc2626',
                  fillOpacity: 0.08,
                  weight: 1.5,
                }}
              />
            ))}
            {femaItems.map((d, i) => (
              <Marker
                key={`${d.id}-${d.state}-${d.declarationDate ?? d.date ?? i}`}
                position={[d.lat, d.lng]}
                icon={redIcon}
              >
                <Popup>
                  <strong>{d.title}</strong>
                  <br />
                  {(d.type ?? 'Disaster')} | {d.state}
                  <br />
                  {d.declarationDate ?? d.date ?? 'No date'}
                  <br />
                  <span className="text-gray-500 text-xs">50 km approximate radius; FEMA designates by county.</span>
                </Popup>
              </Marker>
            ))}

            <MapClickHandler onLocationSelect={handleLocationSelect} />

            {lastClicked && (
              <Marker position={[lastClicked.lat, lastClicked.lng]} zIndexOffset={1000}>
                <Popup>You are here / Selected location</Popup>
              </Marker>
            )}

            {userSafeWater.map((r) => (
              <Marker key={`user-${r.id}`} position={[r.lat, r.lng]} icon={greenIcon}>
                <Popup>
                  <span className="font-medium">{r.name}</span>
                  <br />
                  <span className="text-gray-500 text-xs">Reported by community</span>
                  {r.distanceKm != null && (
                    <>
                      <br />
                      <span className="text-gray-500">{r.distanceKm} km from map center</span>
                    </>
                  )}
                  <br />
                  <a
                    href={directionsUrl(r.lat, r.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm hover:underline"
                  >
                    Get directions →
                  </a>
                </Popup>
              </Marker>
            ))}

            {safeWater?.map((p) => (
              <Marker key={p.id} position={[p.lat, p.lng]}>
                <Popup>
                  <span className="font-medium">{p.name}</span>
                  {p.category && p.category !== 'other' && (
                    <>
                      <br />
                      <span className="text-gray-500 capitalize">{p.category}</span>
                    </>
                  )}
                  <br />
                  <span className="text-gray-500">{p.distanceKm} km away</span>
                  <br />
                  <a
                    href={directionsUrl(p.lat, p.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm hover:underline"
                  >
                    Get directions →
                  </a>
                  <br />
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); handleReportProblem(p); }}
                    className="text-amber-600 text-sm hover:underline mt-0.5"
                  >
                    Report problem
                  </button>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <aside className="bg-gray-50 rounded-lg p-4 border border-gray-200 flex flex-col gap-4 overflow-auto">
          {backendReachable === false && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-lg">
              <strong>Backend not connected.</strong> Run <code>npm run dev</code> from repo root.
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={handleFindSafeWaterNearMe}
              disabled={loadingSafeWater}
              className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg shadow text-sm"
            >
              {loadingSafeWater ? 'Finding...' : 'Find safe water near me'}
            </button>

            {lastClicked && (
              <>
                <button
                  type="button"
                  onClick={handleFindSafeWaterFromPoint}
                  disabled={loadingSafeWater}
                  className="w-full mt-2 py-2 px-3 bg-emerald-100 hover:bg-emerald-200 disabled:opacity-50 text-emerald-800 font-medium rounded-lg text-sm"
                >
                  From clicked point
                </button>
                <button
                  type="button"
                  onClick={handleReportSafeWaterHere}
                  disabled={reportSafeWaterSubmitting}
                  className="w-full mt-2 py-2 px-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg text-sm"
                >
                  {reportSafeWaterSubmitting ? 'Sharing…' : reportSafeWaterDone ? '✓ Shared! Thanks' : 'Report safe water here'}
                </button>
              </>
            )}
          </div>
          {userSafeWater.length > 0 && (
            <p className="text-xs text-gray-500">
              {userSafeWater.length} community-reported safe water location{userSafeWater.length !== 1 ? 's' : ''} on map.
            </p>
          )}

          {safeWaterError && <p className="text-sm text-red-600">{safeWaterError}</p>}

          {risk?.nearbyDisasters && risk.nearbyDisasters.length > 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <h4 className="font-semibold text-red-900 mb-1">Disasters affecting this location</h4>
              <p className="text-red-800 text-xs mb-1">
                <strong>Disasters nearby selected location:</strong>{' '}
                {risk.nearbyDisasters.map((d) => {
                  const name = (d.title ?? 'Disaster declaration').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
                  const n = d.count ?? 1;
                  return `${name} (${n} declaration${n !== 1 ? 's' : ''})`;
                }).join(', ')}.
              </p>
              <p className="text-red-800 text-xs">
                Disasters can affect water supply and quality. Check local and FEMA advisories before using local water.
              </p>
            </div>
          ) : risk && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <h4 className="font-semibold text-red-900 mb-1">Disasters affecting this location</h4>
              <p className="text-red-800 text-xs">
                No disaster declarations within 50 km of the selected point. Check local and FEMA advisories before using local water.
              </p>
            </div>
          )}
          {!risk && (
            <p className="text-gray-500 text-xs">Click the map to see disaster declarations affecting that location.</p>
          )}

          {safeWater && safeWater.length > 0 && (() => {
            const counts = { fountain: 0, tap: 0, refill: 0, other: 0 };
            safeWater.forEach((p) => { counts[p.category ?? 'other']++; });
            const parts: string[] = [];
            if (counts.fountain) parts.push(`${counts.fountain} fountain${counts.fountain !== 1 ? 's' : ''}`);
            if (counts.tap) parts.push(`${counts.tap} tap${counts.tap !== 1 ? 's' : ''}`);
            if (counts.refill) parts.push(`${counts.refill} refill station${counts.refill !== 1 ? 's' : ''}`);
            if (counts.other) parts.push(`${counts.other} other (type unknown)`);
            const summary = parts.length ? parts.join(', ') : 'various';
            return (
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">Nearby safe water</h3>
              <p className="text-xs text-gray-600 mb-2">
                <strong>{safeWater.length} nearby:</strong> {summary}. Water quality at these locations is not verified—treat as uncertain unless officially designated.
              </p>
              <p className="text-xs text-gray-500 mb-2">
                In a disaster, prefer official distribution points when available.
              </p>
              <ul className="space-y-2">
                {safeWater.map((p) => (
                  <li key={p.id} className="text-sm text-gray-700 bg-white p-2 rounded border border-gray-200">
                    <span className="font-medium">{p.name}</span>
                    {p.category && p.category !== 'other' && (
                      <span className="ml-1.5 text-gray-500 text-xs capitalize">({p.category})</span>
                    )}
                    <span className="block text-gray-500">{p.distanceKm} km away</span>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                      <a
                        href={directionsUrl(p.lat, p.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 text-xs hover:underline"
                      >
                        Directions
                      </a>
                      <button
                        type="button"
                        onClick={() => handleReportProblem(p)}
                        className="text-amber-600 text-xs hover:underline"
                      >
                        Report problem
                      </button>
                      {reportSent === p.id && <span className="text-emerald-600 text-xs">Sent</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            );
          })()}

          {safeWater && safeWater.length === 0 && !safeWaterError && (
            <p className="text-sm text-gray-500">No safe water points found nearby.</p>
          )}

          <hr className="border-gray-200" />

          {loading && <p className="text-gray-500">Loading risk score...</p>}

          {risk && (
            <div>
              <p className="text-2xl font-semibold text-gray-800">
                Water safety risk: <span className="text-blue-600">{risk.score}</span>/100
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Based on disasters, water source (reservoir), and hazardous facilities within range. Higher = lower risk.
              </p>
              {risk.reservoir && (
                <p className="mt-2 text-sm text-gray-700">
                  <strong>Water source:</strong> {risk.reservoir.reservoir.name}
                  {risk.reservoir.reservoir.serves && risk.reservoir.reservoir.serves.length > 0 && (
                    <span className="text-gray-500 text-xs"> (serves {risk.reservoir.reservoir.serves.join(', ')})</span>
                  )}
                  <span className="text-gray-500 text-xs"> — {Math.round(risk.reservoir.distanceKm)} km away</span>
                </p>
              )}
              {!risk.reservoir && (
                <p className="mt-2 text-sm text-gray-500">Water source: Unknown (no reservoir within 250 km in our data).</p>
              )}
              {risk.sourceReservoirInDisasterZone && (
                <p className="mt-1 text-sm text-amber-700 font-medium">Your water source is in a disaster zone.</p>
              )}
              {risk.facilitiesAtRisk.length > 0 && (
                <p className="mt-1 text-sm text-amber-700">
                  Disaster near hazardous facility: {risk.facilitiesAtRisk.map((f) => `${f.name} (${f.type.replace('_', ' ')})`).join(', ')}.
                </p>
              )}
              <p className="mt-2 text-sm text-gray-600">{risk.explanation}</p>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI risk evaluation</p>
                {risk.explanationFromAi ? (
                  <p className="mt-1 text-sm text-gray-800">{risk.explanationFromAi}</p>
                ) : (
                  <p className="mt-1 text-sm text-gray-500 italic">
                    AI evaluation is off. Set <code className="text-xs bg-gray-100 px-1 rounded">OPENAI_API_KEY</code> in <code className="text-xs bg-gray-100 px-1 rounded">server/.env</code> and restart the server to see an AI evaluation.
                  </p>
                )}
              </div>
            </div>
          )}

          {!loading && !risk && (
            <p className="text-gray-500">Click a point on the map to see water safety risk.</p>
          )}

          <p className="text-xs text-gray-400 mt-2">
            Data: OpenStreetMap (water), FEMA (disasters), demo reservoir &amp; facility locations. Disaster radius is approximate. See FEMA.gov for official boundaries. Not a substitute for official advisories.
          </p>
        </aside>
      </div>
    </div>
  );
}
