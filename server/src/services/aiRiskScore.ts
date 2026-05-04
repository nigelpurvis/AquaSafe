/**
 * AI-driven, in-depth water safety risk evaluation.
 * Weighs disaster type/severity, distance, reservoir status,
 * and hazardous facilities to produce score + summary + detailed evaluation.
 */
import type { RiskResult } from './riskScoreService.js';
import type { Disaster } from './disasters.js';

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const DISASTER_RADIUS_KM = 50;

export type AiRiskInput = {
  lat: number;
  lng: number;
  disasters: Disaster[];
  result: RiskResult;
};

export type AiRiskOutput = {
  score: number;
  shortSummary: string;
  inDepthEvaluation: string;
};

/**
 * Categorize disaster type for water-impact weighting.
 * Returns a tag the model can use for severity reasoning.
 */
function classifyDisasterWaterImpact(title: string, type?: string): string {
  const t = ((title ?? '') + ' ' + (type ?? '')).toLowerCase();
  if (t.includes('flood')) return 'FLOOD [direct contamination — sewage overflow, chemical runoff, treatment plant flooding]';
  if (t.includes('hurricane') || t.includes('typhoon') || t.includes('tropical'))
    return 'HURRICANE/TROPICAL [storm surge flooding, infrastructure destruction, extended power loss]';
  if (t.includes('earthquake')) return 'EARTHQUAKE [pipe rupture, reservoir damage, treatment plant structural failure]';
  if (t.includes('tornado')) return 'TORNADO [localized infrastructure destruction, power loss]';
  if (t.includes('fire') || t.includes('wildfire'))
    return 'WILDFIRE [watershed contamination from ash/debris, increased turbidity, long-term soil runoff]';
  if (t.includes('winter') || t.includes('ice') || t.includes('freeze') || t.includes('snow') || t.includes('cold'))
    return 'WINTER STORM [pipe freezing/bursting, power loss → treatment plant shutdown, road closures delay repair]';
  if (t.includes('severe storm') || t.includes('wind'))
    return 'SEVERE STORM [power outages, debris in open water sources, moderate infrastructure risk]';
  if (t.includes('drought')) return 'DROUGHT [reduced reservoir levels, concentrated contaminants, supply shortage]';
  if (t.includes('volcanic')) return 'VOLCANIC [ash contamination, acidification of water sources]';
  if (t.includes('tsunami')) return 'TSUNAMI [saltwater intrusion into freshwater, massive infrastructure damage]';
  return 'OTHER DISASTER [general infrastructure and supply risk]';
}

function buildContext(input: AiRiskInput): string {
  const { lat, lng, disasters, result } = input;
  const lines: string[] = [];

  lines.push(`=== ASSESSED LOCATION: ${lat.toFixed(4)}, ${lng.toFixed(4)} ===`);
  lines.push('');

  // --- Nearby disasters with classification ---
  const nearbyDisasters = disasters
    .filter((d) => d.lat != null && d.lng != null)
    .map((d) => ({
      ...d,
      dist: distanceKm(lat, lng, d.lat!, d.lng!),
    }))
    .filter((d) => d.dist <= DISASTER_RADIUS_KM)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 20);

  lines.push(`--- DISASTERS WITHIN 50 KM (${nearbyDisasters.length} found) ---`);
  if (nearbyDisasters.length > 0) {
    for (const d of nearbyDisasters) {
      const name = d.title ?? d.type ?? 'Unknown disaster';
      const impact = classifyDisasterWaterImpact(name, d.type);
      const proximity =
        d.dist < 10 ? 'VERY CLOSE' : d.dist < 25 ? 'CLOSE' : 'MODERATE DISTANCE';
      lines.push(
        `• ${name} (${d.state ?? '??'}) — ${Math.round(d.dist)} km [${proximity}] — Water impact: ${impact}`
      );
    }
  } else {
    lines.push('None. No FEMA disaster declarations within 50 km.');
  }
  lines.push('');

  // --- Water source reservoir ---
  lines.push('--- WATER SOURCE (RESERVOIR) ---');
  if (result.reservoir) {
    const r = result.reservoir;
    lines.push(
      `Identified source: ${r.reservoir.name} (${r.reservoir.state}), ${Math.round(r.distanceKm)} km from point.`
    );
    if (r.reservoir.serves && r.reservoir.serves.length > 0) {
      lines.push(`Serves: ${r.reservoir.serves.join(', ')}.`);
    }
    if (result.sourceReservoirInDisasterZone) {
      lines.push(
        '⚠ CRITICAL: This reservoir is INSIDE a declared disaster zone. ' +
        'This means the raw water supply itself may be compromised — treatment plants drawing from this source ' +
        'face contamination risk, capacity issues, or potential shutdown.'
      );
    } else {
      lines.push('Reservoir is NOT in a disaster zone.');
    }
  } else {
    lines.push(
      'No reservoir found within 250 km. Water source unknown — assume municipal supply, ' +
      'but inability to identify the source is itself a mild risk factor.'
    );
  }
  lines.push('');

  // --- Hazardous facilities ---
  lines.push(`--- HAZARDOUS FACILITIES IN DISASTER ZONES (${result.facilitiesAtRisk.length} found) ---`);
  if (result.facilitiesAtRisk.length > 0) {
    for (const f of result.facilitiesAtRisk) {
      const fType = f.type.replace(/_/g, ' ');
      let riskNote = '';
      if (f.type.includes('nuclear')) riskNote = ' → radioactive contamination risk to water if damaged';
      else if (f.type.includes('refiner') || f.type.includes('chemical'))
        riskNote = ' → chemical/petroleum runoff into watershed if compromised';
      else if (f.type.includes('power')) riskNote = ' → power loss can shut down water treatment plants';
      lines.push(
        `• ${f.name} (${fType}, ${f.state}) — ${Math.round(f.distanceKm)} km from point${riskNote}`
      );
    }
  } else {
    lines.push('None. No hazardous facilities with active disasters nearby.');
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are a water safety risk analyst specializing in disaster impact on drinking water systems. You produce accurate, actionable risk evaluations.

SCORING RULES (follow strictly):

Start at 100 (perfectly safe). Subtract penalties:

DISASTER PROXIMITY PENALTIES (per disaster):
- Flood/Hurricane/Tsunami within 10 km: −25 to −35
- Flood/Hurricane/Tsunami within 10–25 km: −15 to −25
- Flood/Hurricane/Tsunami within 25–50 km: −8 to −15
- Earthquake within 10 km: −20 to −30
- Earthquake within 10–50 km: −10 to −20
- Wildfire within 25 km: −15 to −25 (watershed contamination)
- Wildfire within 25–50 km: −8 to −12
- Winter/Severe storm within 25 km: −10 to −18
- Winter/Severe storm within 25–50 km: −5 to −10
- Drought: −10 to −20 (ongoing supply pressure)
- Other disasters: −5 to −15 based on proximity

RESERVOIR PENALTY:
- Water source reservoir IN a disaster zone: −15 to −25 ADDITIONAL (this is critical — it means the raw water supply is directly threatened)

FACILITY PENALTIES (per facility in a disaster zone):
- Nuclear facility: −10 to −20
- Refinery/Chemical plant: −8 to −15
- Power plant: −5 to −10

MULTIPLE DISASTER COMPOUNDING:
- 2+ disasters: apply a −5 compounding penalty (cascading failures are more than additive)
- 3+ disasters: apply −10 compounding penalty

FLOOR: Score cannot go below 5 (there is always some residual safety from bottled water/emergency response).
CEILING: Only give 90–100 if there are zero disasters, reservoir is safe, and no facilities at risk.

OUTPUT FORMAT — respond with ONLY this JSON, no markdown, no backticks, no extra text:
{"score":<number>,"shortSummary":"<one sentence>","inDepthEvaluation":"<3-5 sentences>"}`;

const USER_PROMPT_TEMPLATE = `Evaluate the water safety risk for this location using ONLY the data below. Follow the scoring rules exactly.

For the inDepthEvaluation:
1. State what is driving the score (which disasters, how close, what type)
2. Explain what each disaster type specifically means for water (e.g. floods → sewage overflow and contamination of surface water; winter storms → power outages shutting down treatment plants and frozen/burst pipes)
3. If the reservoir is in a disaster zone, explain clearly: "Your water source [name] is within a disaster zone, which means the raw water feeding treatment plants may be contaminated or supply may be disrupted"
4. If hazardous facilities are at risk, note the specific danger (e.g. "A refinery 12 km away in a flood zone increases chemical runoff risk into local waterways")
5. End with ONE specific, practical recommendation (e.g. "Fill containers with tap water now in case supply is disrupted" or "Check your utility's website for boil-water advisories" or "Have 3 days of bottled water ready")

Data:
{{CONTEXT}}

Respond with ONLY valid JSON — no markdown fences, no extra text:
{"score":<number 0-100>,"shortSummary":"<one sentence>","inDepthEvaluation":"<3-5 sentences>"}`;

/**
 * Calls the model for an in-depth risk score and evaluation.
 * Returns null if API key missing or call fails.
 */
export async function getAiRiskScore(input: AiRiskInput): Promise<AiRiskOutput | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    console.log('[AI Risk] No OPENAI_API_KEY — using heuristic score');
    return null;
  }

  const context = buildContext(input);
  const userPrompt = USER_PROMPT_TEMPLATE.replace('{{CONTEXT}}', context);

  try {
    console.log('[AI Risk] Calling OpenAI for in-depth evaluation...');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 500, // bumped from 350 — inDepthEvaluation needs room
        temperature: 0.15, // lowered for more consistent scoring
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[AI Risk] OpenAI error', res.status, errBody.slice(0, 200));
      return null;
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      console.warn('[AI Risk] Empty response');
      return null;
    }

    // Strip markdown code fences if present
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) raw = codeBlock[1].trim();

    // Also strip leading/trailing backticks just in case
    raw = raw.replace(/^`+|`+$/g, '').trim();

    let parsed: { score?: number; shortSummary?: string; inDepthEvaluation?: string };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      // Try to extract JSON from a larger string
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
        } catch {
          console.warn('[AI Risk] Invalid JSON after extraction:', raw.slice(0, 150));
          return null;
        }
      } else {
        console.warn('[AI Risk] No JSON found:', raw.slice(0, 150));
        return null;
      }
    }

    const score =
      typeof parsed.score === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : null;
    const shortSummary =
      typeof parsed.shortSummary === 'string' && parsed.shortSummary.trim().length > 0
        ? parsed.shortSummary.trim()
        : null;
    const inDepthEvaluation =
      typeof parsed.inDepthEvaluation === 'string' && parsed.inDepthEvaluation.trim().length > 0
        ? parsed.inDepthEvaluation.trim()
        : null;

    if (score == null || !shortSummary || !inDepthEvaluation) {
      console.warn('[AI Risk] Missing fields:', {
        score,
        shortSummary: !!shortSummary,
        inDepth: !!inDepthEvaluation,
      });
      return null;
    }

    console.log('[AI Risk] Score', score, '—', shortSummary.slice(0, 60) + '...');
    return { score, shortSummary, inDepthEvaluation };
  } catch (e) {
    console.error('[AI Risk] Request failed:', e instanceof Error ? e.message : e);
    return null;
  }
}