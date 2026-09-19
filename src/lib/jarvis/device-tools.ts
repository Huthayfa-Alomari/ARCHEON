import type { ToolCall, ToolExecutionResult } from "./types";
import { deviceMeshStatus, enqueueCommand, getDevice, listDevices, recentCommands, revokeDevice, startPairing } from "./device-mesh";
import { capabilityCatalog, grantCapabilities, hasCapabilityGrant, listCapabilityGrants, listPermissionRequests, requestCapabilities, revokeCapabilities } from "./permission-broker";
import { healthVaultStatus, latestHealthSamples, type HealthType } from "./health-vault";
import { browserSkillBorrowTab, browserSkillClick, browserSkillFill, browserSkillListUserTabs, browserSkillNavigate, browserSkillObserve, browserSkillReturnTab, browserSkillStart, browserSkillStatus, browserSkillStop } from "./browser-skill-adapter";
import { renderMetaDisplay, requestMetaPhoto, requestMetaStream } from "./meta-wearables-adapter";

function str(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
function int(v: unknown, fallback: number, min: number, max: number) {
  const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}
function strArray(v: unknown) { return Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : []; }
const BROWSER_PRINCIPAL = "local:browser-skill";
async function requireBrowserGrant(capability: string) {
  if (!(await hasCapabilityGrant(BROWSER_PRINCIPAL, capability))) throw new Error(`Permission Broker denied ${capability}. Run /browser authorize and approve the scoped grant first.`);
}


export async function deviceTool(call: ToolCall): Promise<ToolExecutionResult | null> {
  switch (call.tool) {
    case "device.mesh.status": {
      const [mesh, vault] = await Promise.all([deviceMeshStatus(), Promise.resolve(healthVaultStatus())]);
      const data = { mesh, healthVault: vault };
      return { ok: true, tool: call.tool, summary: JSON.stringify(data, null, 2), data };
    }
    case "device.list": {
      const devices = await listDevices();
      return { ok: true, tool: call.tool, summary: devices.length ? devices.map((d) => `${d.id} | ${d.name} | ${d.kind} | ${d.status} | ${d.capabilities.join(", ") || "no advertised capabilities"}`).join("\n") : "No paired devices.", data: devices };
    }
    case "device.commands": {
      const deviceId = str(call.args.deviceId) || undefined;
      const commands = await recentCommands(deviceId, int(call.args.limit, 20, 1, 100));
      return { ok: true, tool: call.tool, summary: JSON.stringify(commands, null, 2), data: commands };
    }
    case "device.pair.start": {
      const result = await startPairing(str(call.args.label) || undefined);
      return { ok: true, tool: call.tool, summary: `Pairing code: ${result.code}\nPairing ID: ${result.pairingId}\nExpires: ${result.expiresAt}`, data: result, sensitivity: "private" };
    }
    case "device.revoke": {
      const deviceId = str(call.args.deviceId);
      if (!deviceId) throw new Error("deviceId is required.");
      const ok = await revokeDevice(deviceId);
      await revokeCapabilities(deviceId);
      return { ok, tool: call.tool, summary: ok ? `Revoked device ${deviceId} and its permission grants.` : "Device not found." };
    }
    case "device.permission.catalog": {
      const catalog = capabilityCatalog();
      return { ok: true, tool: call.tool, summary: catalog.map((c) => `${c.id} [${c.sensitivity}] — ${c.description}`).join("\n"), data: catalog };
    }
    case "device.permission.list": {
      const deviceId = str(call.args.deviceId) || undefined;
      const [grants, requests] = await Promise.all([listCapabilityGrants(deviceId), listPermissionRequests()]);
      const data = { grants, requests: requests.filter((r) => !deviceId || r.deviceId === deviceId) };
      return { ok: true, tool: call.tool, summary: JSON.stringify(data, null, 2), data };
    }
    case "device.permission.request": {
      const deviceId = str(call.args.deviceId);
      const capabilities = strArray(call.args.capabilities);
      if (!deviceId) throw new Error("deviceId is required.");
      const req = await requestCapabilities(deviceId, capabilities, str(call.args.reason) || undefined);
      return { ok: true, tool: call.tool, summary: `Permission request ${req.id} created for ${deviceId}: ${req.capabilities.join(", ")}`, data: req };
    }
    case "device.permission.grant": {
      const deviceId = str(call.args.deviceId);
      const capabilities = strArray(call.args.capabilities);
      if (!deviceId) throw new Error("deviceId is required.");
      const grants = await grantCapabilities(deviceId, capabilities, call.args.ttlMinutes == null ? undefined : int(call.args.ttlMinutes, 60, 1, 525600), str(call.args.reason) || "owner approval");
      return { ok: true, tool: call.tool, summary: `Granted to ${deviceId}: ${grants.map((g) => `${g.capability}${g.expiresAt ? ` until ${g.expiresAt}` : ""}`).join(", ")}`, data: grants };
    }
    case "device.permission.revoke": {
      const deviceId = str(call.args.deviceId);
      const capabilities = strArray(call.args.capabilities);
      if (!deviceId) throw new Error("deviceId is required.");
      const count = await revokeCapabilities(deviceId, capabilities.length ? capabilities : undefined);
      return { ok: true, tool: call.tool, summary: `Revoked ${count} permission grant(s) from ${deviceId}.`, data: { count } };
    }
    case "device.notify": {
      const deviceId = str(call.args.deviceId);
      const device = await getDevice(deviceId);
      if (!device) throw new Error("Device not found.");
      if (!(await hasCapabilityGrant(deviceId, "device.notifications.push"))) throw new Error(`Permission Broker denied device.notifications.push for ${deviceId}.`);
      const command = await enqueueCommand({ deviceId, type: "device.notification", requiredCapability: "device.notifications.push", payload: { title: str(call.args.title).slice(0, 120) || "JARVIS", body: str(call.args.body).slice(0, 1200) }, ttlSeconds: 300 });
      return { ok: true, tool: call.tool, summary: `Queued notification ${command.id} for ${device.name}.`, data: command };
    }
    case "device.vibrate": {
      const deviceId = str(call.args.deviceId);
      const ms = int(call.args.ms, 300, 50, 2000);
      if (!(await hasCapabilityGrant(deviceId, "device.vibrate"))) throw new Error(`Permission Broker denied device.vibrate for ${deviceId}.`);
      const command = await enqueueCommand({ deviceId, type: "device.vibrate", requiredCapability: "device.vibrate", payload: { ms }, ttlSeconds: 120 });
      return { ok: true, tool: call.tool, summary: `Queued vibration ${command.id} (${ms}ms).`, data: command };
    }
    case "health.latest": {
      const deviceId = str(call.args.deviceId) || undefined;
      const types = strArray(call.args.types) as HealthType[];
      const samples = await latestHealthSamples({ deviceId, types: types.length ? types : undefined, limit: int(call.args.limit, 20, 1, 100) });
      const summary = samples.length ? samples.map((s) => `${s.startTime} | ${s.type} | ${typeof s.value === "object" ? JSON.stringify(s.value) : s.value} ${s.unit} | device=${s.deviceId}${s.source ? ` | source=${s.source}` : ""}`).join("\n") : "No matching health samples in the encrypted Health Vault.";
      return { ok: true, tool: call.tool, summary, data: samples, sensitivity: "health" };
    }
    case "browser.skill.status": {
      const r = await browserSkillStatus();
      return { ok: r.ok, tool: call.tool, summary: r.stdout || r.stderr || "BrowserSkill returned no output.", data: r.json };
    }
    case "browser.skill.start": {
      await requireBrowserGrant("browser.observe");
      const r = await browserSkillStart();
      return { ok: r.ok, tool: call.tool, summary: r.stdout || r.stderr, data: r.json, sensitivity: "private" };
    }
    case "browser.skill.stop": {
      const r = await browserSkillStop(call.args.sessionId);
      return { ok: r.ok, tool: call.tool, summary: r.stdout || r.stderr };
    }
    case "browser.skill.navigate": {
      await requireBrowserGrant("browser.navigate");
      const r = await browserSkillNavigate(call.args.sessionId, call.args.url);
      return { ok: r.ok, tool: call.tool, summary: r.stdout || r.stderr, sensitivity: "private" };
    }
    case "browser.skill.observe": {
      await requireBrowserGrant("browser.observe");
      const r = await browserSkillObserve(call.args.sessionId, call.args.maxTokens);
      return { ok: r.ok, tool: call.tool, summary: r.stdout || r.stderr, data: r.json, sensitivity: "private" };
    }
    case "browser.skill.click": {
      await requireBrowserGrant("browser.interact");
      const r = await browserSkillClick(call.args.sessionId, call.args.ref);
      return { ok: r.ok, tool: call.tool, summary: r.stdout || r.stderr, sensitivity: "private" };
    }
    case "browser.skill.fill": {
      await requireBrowserGrant("browser.interact");
      const r = await browserSkillFill(call.args.sessionId, call.args.ref, call.args.value);
      return { ok: r.ok, tool: call.tool, summary: r.stdout || r.stderr, sensitivity: "private" };
    }
    case "browser.skill.tabs": {
      await requireBrowserGrant("browser.observe");
      const r = await browserSkillListUserTabs(call.args.sessionId);
      return { ok: r.ok, tool: call.tool, summary: r.stdout || r.stderr, data: r.json, sensitivity: "private" };
    }
    case "browser.skill.borrow": {
      await requireBrowserGrant("browser.borrow_user_tab");
      const r = await browserSkillBorrowTab(call.args.sessionId, call.args.tabId);
      return { ok: r.ok, tool: call.tool, summary: r.stdout || r.stderr, data: r.json, sensitivity: "private" };
    }
    case "browser.skill.return": {
      await requireBrowserGrant("browser.borrow_user_tab");
      const r = await browserSkillReturnTab(call.args.sessionId, call.args.tabId);
      return { ok: r.ok, tool: call.tool, summary: r.stdout || r.stderr, data: r.json, sensitivity: "private" };
    }
    case "meta.photo.capture": {
      const command = await requestMetaPhoto(str(call.args.deviceId));
      return { ok: true, tool: call.tool, summary: `Queued Meta glasses photo capture command ${command.id}.`, data: command };
    }
    case "meta.camera.stream": {
      const action = str(call.args.action) === "stop" ? "stop" : "start";
      const q = str(call.args.quality); const quality = q === "low" || q === "high" ? q : "medium";
      const command = await requestMetaStream(str(call.args.deviceId), action, quality);
      return { ok: true, tool: call.tool, summary: `Queued Meta camera stream ${action} command ${command.id}.`, data: command };
    }
    case "meta.display.render": {
      const command = await renderMetaDisplay(str(call.args.deviceId), str(call.args.text));
      return { ok: true, tool: call.tool, summary: `Queued Meta display render command ${command.id}.`, data: command };
    }
    default: return null;
  }
}

export async function prepareDeviceApproval(call: ToolCall): Promise<{ call: ToolCall; preview?: string } | null> {
  const risky = new Set([
    "device.pair.start", "device.revoke", "device.permission.grant", "device.permission.revoke",
    "device.notify", "device.vibrate", "browser.skill.start", "browser.skill.stop", "browser.skill.navigate",
    "browser.skill.click", "browser.skill.fill", "browser.skill.borrow", "browser.skill.return", "meta.photo.capture", "meta.camera.stream", "meta.display.render",
  ]);
  if (!risky.has(call.tool)) return null;
  const args = JSON.stringify(call.args, null, 2);
  return { call, preview: `DEVICE MESH ACTION\n${call.tool}\n\n${args}\n\nThis action crosses a device/browser authority boundary and requires explicit owner approval.` };
}
