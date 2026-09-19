import { safeFetchText } from "./safe-net";
import { jarvisConfig } from "./config";

function enc(v: unknown) { return encodeURIComponent(String(v ?? "")); }
function json(text: string) { return JSON.parse(text) as unknown; }

export async function kaggleSearch(query: string, page = 1) {
  const token = jarvisConfig.kaggleToken;
  if (!token) throw new Error("KAGGLE_API_TOKEN is not configured. Create a Kaggle Personal Token and store it in .env.local.");
  const url = `https://www.kaggle.com/api/v1/datasets/list?search=${enc(query)}&page=${Math.max(1, page)}`;
  const r = await safeFetchText(url, { maxBytes: 800_000, headers: { Authorization: `Bearer ${token}` } });
  return json(r.text);
}

export async function huggingFaceDatasetSearch(query: string, limit = 12) {
  const url = `https://huggingface.co/api/datasets?search=${enc(query)}&limit=${Math.max(1, Math.min(50, limit))}&sort=likes&direction=-1`;
  const headers: Record<string,string> = {};
  if (jarvisConfig.huggingFaceToken) headers.Authorization = `Bearer ${jarvisConfig.huggingFaceToken}`;
  return json((await safeFetchText(url, { maxBytes: 900_000, headers })).text);
}

export async function worldBankIndicator(indicator: string, country = "all", date?: string) {
  const datePart = date ? `&date=${enc(date)}` : "";
  const url = `https://api.worldbank.org/v2/country/${enc(country)}/indicator/${enc(indicator)}?format=json&per_page=1000${datePart}`;
  return json((await safeFetchText(url, { maxBytes: 1_200_000 })).text);
}

export async function fredSeries(seriesId: string, observationStart?: string) {
  if (!jarvisConfig.fredApiKey) throw new Error("FRED_API_KEY is not configured in .env.local.");
  const start = observationStart ? `&observation_start=${enc(observationStart)}` : "";
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${enc(seriesId)}&api_key=${enc(jarvisConfig.fredApiKey)}&file_type=json${start}`;
  return json((await safeFetchText(url, { maxBytes: 1_200_000 })).text);
}

export async function secCompanyFacts(cik: string) {
  const normalized = cik.replace(/\D/g, "").padStart(10, "0");
  if (!/^\d{10}$/.test(normalized)) throw new Error("CIK must be numeric.");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${normalized}.json`;
  return json((await safeFetchText(url, { maxBytes: 1_500_000, headers: { "User-Agent": jarvisConfig.secUserAgent } })).text);
}

export async function openAlexWorks(query: string, limit = 12) {
  const key = jarvisConfig.openAlexApiKey ? `&api_key=${enc(jarvisConfig.openAlexApiKey)}` : "";
  const url = `https://api.openalex.org/works?search=${enc(query)}&filter=open_access.is_oa:true&per_page=${Math.max(1, Math.min(50, limit))}&sort=cited_by_count:desc${key}`;
  return json((await safeFetchText(url, { maxBytes: 1_200_000 })).text);
}

export async function huggingFaceDatasetSample(dataset: string, length = 50, config?: string, split?: string) {
  const headers: Record<string,string> = {};
  if (jarvisConfig.huggingFaceToken) headers.Authorization = `Bearer ${jarvisConfig.huggingFaceToken}`;
  let chosenConfig = config || "";
  let chosenSplit = split || "";
  if (!chosenConfig || !chosenSplit) {
    const splitsUrl = `https://datasets-server.huggingface.co/splits?dataset=${enc(dataset)}`;
    const splitData = json((await safeFetchText(splitsUrl, { maxBytes: 500_000, headers })).text) as { splits?: Array<{config?:string; split?:string}> };
    const first = splitData.splits?.find((x) => x.config && x.split);
    if (!first) throw new Error("No Dataset Viewer split is available for this dataset.");
    chosenConfig = chosenConfig || first.config || "";
    chosenSplit = chosenSplit || first.split || "";
  }
  const rowsUrl = `https://datasets-server.huggingface.co/rows?dataset=${enc(dataset)}&config=${enc(chosenConfig)}&split=${enc(chosenSplit)}&offset=0&length=${Math.max(1, Math.min(100, length))}`;
  const rows = json((await safeFetchText(rowsUrl, { maxBytes: 1_500_000, headers })).text);
  return { dataset, config: chosenConfig, split: chosenSplit, rows };
}
