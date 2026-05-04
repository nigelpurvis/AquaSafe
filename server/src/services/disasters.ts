/**
 * Fetches disasters for risk scoring. Uses FEMA service directly so risk score
 * is based on real disaster declarations (with approximate state-level coordinates).
 */
import { getFemaDisasters } from './fema.js';

export type Disaster = {
  id: string;
  disasterNumber?: string;
  title?: string;
  state?: string;
  lat?: number;
  lng?: number;
  type?: string;
  riskScore?: number;
};

const RISK_DISASTER_FETCH_LIMIT = 250;

export async function getDisasters(): Promise<Disaster[]> {
  try {
    const items = await getFemaDisasters(RISK_DISASTER_FETCH_LIMIT);
    return items.map((d) => ({
      id: d.id,
      disasterNumber: d.disasterNumber,
      title: d.title,
      state: d.state,
      lat: d.lat,
      lng: d.lng,
      type: d.type,
    }));
  } catch (error) {
    console.error('[Risk] Failed to fetch FEMA disasters for scoring:', error);
    return [];
  }
}
