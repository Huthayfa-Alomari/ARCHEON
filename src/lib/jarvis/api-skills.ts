import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { jarvisConfig } from "./config";
import { assertSafeHttpsStructure, safeFetchText } from "./safe-net";

export type ApiSkill = {
  id: string;
  name: string;
  description: string;
  urlTemplate: string;
  createdAt: string;
};

type SkillStore = { skills: ApiSkill[] };
function filePath() { return path.resolve(process.cwd(), jarvisConfig.apiSkillsPath); }

async function readStore(): Promise<SkillStore> {
  try { const data = JSON.parse(await fs.readFile(filePath(), "utf8")) as SkillStore; return { skills: Array.isArray(data.skills) ? data.skills : [] }; }
  catch { return { skills: [] }; }
}
async function writeStore(store: SkillStore) {
  const target = filePath(); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, JSON.stringify(store, null, 2), "utf8");
}

export async function listApiSkills() { return (await readStore()).skills; }

export async function validateApiSkill(args: Record<string, unknown>) {
  const name = typeof args.name === "string" ? args.name.trim() : "";
  const description = typeof args.description === "string" ? args.description.trim() : "";
  const urlTemplate = typeof args.urlTemplate === "string" ? args.urlTemplate.trim() : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,48}$/i.test(name)) throw new Error("Skill name must be 3-49 letters/numbers/._- characters.");
  if (!description || description.length > 500) throw new Error("Skill description is required and must be <= 500 characters.");
  if (!urlTemplate || urlTemplate.length > 2000) throw new Error("urlTemplate is required and must be <= 2000 characters.");
  if (/(token|secret|password|api[_-]?key)=/i.test(urlTemplate)) throw new Error("Do not embed secrets in persisted API skills.");
  const templateAuthority = urlTemplate.match(/^https:\/\/([^/]+)/i)?.[1] || "";
  if (templateAuthority.includes("{{")) throw new Error("Placeholders are not allowed in the hostname or port.");
  const structuralUrl = urlTemplate.replace(/\{\{[^}]+\}\}/g, "example");
  assertSafeHttpsStructure(structuralUrl);
  return { name, description, urlTemplate };
}

export async function registerApiSkill(args: Record<string, unknown>) {
  const validated = await validateApiSkill(args);
  const store = await readStore();
  if (store.skills.some((s) => s.name.toLowerCase() === validated.name.toLowerCase())) throw new Error("A skill with that name already exists.");
  const skill: ApiSkill = { id: randomUUID(), ...validated, createdAt: new Date().toISOString() };
  store.skills.push(skill); await writeStore(store); return skill;
}

export async function runApiSkill(name: string, params: Record<string, unknown>) {
  const skill = (await readStore()).skills.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!skill) throw new Error(`Unknown API skill: ${name}`);
  let url = skill.urlTemplate;
  for (const [key, value] of Object.entries(params)) {
    const token = `{{${key}}}`;
    url = url.split(token).join(encodeURIComponent(String(value)));
  }
  const unresolved = url.match(/\{\{([^}]+)\}\}/g);
  if (unresolved?.length) throw new Error(`Missing skill parameters: ${unresolved.join(", ")}`);
  const result = await safeFetchText(url, { maxBytes: 500_000 });
  return { skill, ...result };
}
