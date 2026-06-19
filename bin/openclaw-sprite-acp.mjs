#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ENV_PROJECTS_FILE = "OPENCLAW_SPRITE_PROJECTS";
const ENV_PROJECT = "OPENCLAW_SPRITE_PROJECT";
const ENV_SPRITE = "OPENCLAW_SPRITE_NAME";
const ENV_DIR = "OPENCLAW_SPRITE_DIR";
const ENV_SPRITE_BIN = "OPENCLAW_SPRITE_BIN";
const ENV_HARNESS = "OPENCLAW_SPRITE_HARNESS";
const LEASE_ID_ARG = "--openclaw-acpx-lease-id";
const GATEWAY_INSTANCE_ID_ARG = "--openclaw-gateway-instance-id";

export const DEFAULT_HARNESSES = Object.freeze({
  codex: Object.freeze({
    command: "npm",
    args: Object.freeze([
      "exec",
      "--yes",
      "--package",
      "@zed-industries/codex-acp@0.15.0",
      "--",
      "codex-acp",
    ]),
  }),
  claude: Object.freeze({
    command: "npm",
    args: Object.freeze([
      "exec",
      "--yes",
      "--package",
      "@agentclientprotocol/claude-agent-acp@0.39.0",
      "--",
      "claude-agent-acp",
    ]),
  }),
});

function fail(message) {
  throw new Error(message);
}

function usage() {
  return [
    "Usage: openclaw-sprite-acp --harness <codex|claude> [options]",
    "",
    "Options:",
    "  --projects <file>   JSON registry mapping local cwd values to Sprite projects",
    "  --project <name>    Project key from the registry; otherwise inferred from cwd",
    "  --sprite <name>     Sprite name override",
    "  --dir <path>        Remote working directory override",
    "  --sprite-bin <bin>  Sprite executable path or name (default: sprite)",
    "  --env KEY=VALUE     Environment value passed to sprite exec; repeatable",
    "  -c <value>          Extra Codex ACP config forwarded to the remote adapter",
    "  --                 Forward the remaining args to the remote adapter",
  ].join("\n");
}

function readRequiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${option} requires a value`);
  }
  return value;
}

function pushEnvValue(env, raw) {
  const separator = raw.indexOf("=");
  if (separator <= 0) {
    fail("--env values must use KEY=VALUE");
  }
  const name = raw.slice(0, separator);
  const value = raw.slice(separator + 1);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    fail(`Invalid environment variable name: ${name}`);
  }
  env[name] = value;
}

function stripOpenClawLeaseArgs(argv) {
  const stripped = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === LEASE_ID_ARG || arg === GATEWAY_INSTANCE_ID_ARG) {
      index += 1;
      continue;
    }
    stripped.push(arg);
  }
  return stripped;
}

export function parseLauncherArgs(argv, env = process.env) {
  const args = stripOpenClawLeaseArgs(argv);
  const options = {
    adapterArgs: [],
    env: {},
    harness: env[ENV_HARNESS],
    project: env[ENV_PROJECT],
    projectsFile: env[ENV_PROJECTS_FILE],
    sprite: env[ENV_SPRITE],
    dir: env[ENV_DIR],
    spriteBin: env[ENV_SPRITE_BIN] || "sprite",
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      options.adapterArgs.push(...stripOpenClawLeaseArgs(args.slice(index + 1)));
      break;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "-c") {
      options.adapterArgs.push(arg, readRequiredValue(args, index, arg));
      index += 1;
      continue;
    }
    const optionWithEquals = /^(--[^=]+)=(.*)$/u.exec(arg);
    const option = optionWithEquals?.[1] ?? arg;
    const equalsValue = optionWithEquals?.[2];
    const value = () => {
      if (equalsValue !== undefined) {
        return equalsValue;
      }
      const next = readRequiredValue(args, index, option);
      index += 1;
      return next;
    };

    switch (option) {
      case "--harness":
        options.harness = value();
        break;
      case "--project":
        options.project = value();
        break;
      case "--projects":
        options.projectsFile = value();
        break;
      case "--sprite":
        options.sprite = value();
        break;
      case "--dir":
        options.dir = value();
        break;
      case "--sprite-bin":
        options.spriteBin = value();
        break;
      case "--env":
        pushEnvValue(options.env, value());
        break;
      default:
        fail(`Unknown sprite ACP launcher option: ${arg}`);
    }
  }

  return options;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Unable to read Sprite project registry ${filePath}: ${detail}`);
  }
}

export function loadProjectsFile(filePath) {
  if (!filePath) {
    return undefined;
  }
  return readJsonFile(path.resolve(filePath));
}

function asRecord(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
  return value;
}

function asOptionalString(value, field) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function asStringArray(value, field) {
  if (value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    fail(`${field} must be a string or an array of strings`);
  }
  return value.filter((entry) => entry.trim().length > 0);
}

function normalizeEnvRecord(value, field) {
  if (value === undefined) {
    return {};
  }
  const record = asRecord(value, field);
  const normalized = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== "string") {
      fail(`${field}.${key} must be a string`);
    }
    pushEnvValue(normalized, `${key}=${entry}`);
  }
  return normalized;
}

function normalizeHarnesses(rawHarnesses) {
  const normalized = { ...DEFAULT_HARNESSES };
  if (rawHarnesses === undefined) {
    return normalized;
  }
  const harnesses = asRecord(rawHarnesses, "harnesses");
  for (const [name, rawConfig] of Object.entries(harnesses)) {
    const config = asRecord(rawConfig, `harnesses.${name}`);
    const command =
      asOptionalString(config.command, `harnesses.${name}.command`) ??
      fail(`harnesses.${name}.command is required`);
    normalized[name] = Object.freeze({
      command,
      args: Object.freeze(asStringArray(config.args, `harnesses.${name}.args`)),
    });
  }
  return normalized;
}

function normalizeProjects(rawProjects) {
  if (rawProjects === undefined) {
    return {};
  }
  const projects = asRecord(rawProjects, "projects");
  const normalized = {};
  for (const [name, rawConfig] of Object.entries(projects)) {
    const config = asRecord(rawConfig, `projects.${name}`);
    const localCwds = [
      ...asStringArray(config.localCwd, `projects.${name}.localCwd`),
      ...asStringArray(config.localCwds, `projects.${name}.localCwds`),
    ];
    normalized[name] = {
      name,
      sprite: asOptionalString(config.sprite, `projects.${name}.sprite`),
      dir: asOptionalString(config.dir, `projects.${name}.dir`),
      localCwds,
      env: normalizeEnvRecord(config.env, `projects.${name}.env`),
    };
  }
  return normalized;
}

export function normalizeRegistry(rawRegistry = {}) {
  const registry = asRecord(rawRegistry, "Sprite project registry");
  return {
    defaultSprite: asOptionalString(registry.defaultSprite, "defaultSprite"),
    projects: normalizeProjects(registry.projects),
    harnesses: normalizeHarnesses(registry.harnesses),
  };
}

function pathContains(base, candidate) {
  const relative = path.relative(path.resolve(base), path.resolve(candidate));
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function bestCwdProjectMatch(projects, cwd) {
  let selected;
  for (const project of Object.values(projects)) {
    for (const localCwd of project.localCwds) {
      if (!pathContains(localCwd, cwd)) {
        continue;
      }
      const resolved = path.resolve(localCwd);
      if (!selected || resolved.length > selected.localCwd.length) {
        selected = { project, localCwd: resolved };
      }
    }
  }
  return selected;
}

function remoteJoin(base, relative) {
  if (!relative || relative === ".") {
    return base;
  }
  const suffix = relative.split(path.sep).filter(Boolean).join("/");
  return `${base.replace(/\/+$/u, "")}/${suffix}`;
}

function resolveRemoteDir({ explicitDir, project, cwd, localCwd }) {
  if (explicitDir) {
    return explicitDir;
  }
  if (!project?.dir) {
    fail("Remote Sprite directory is required; set --dir or projects.<name>.dir");
  }
  if (!localCwd || !pathContains(localCwd, cwd)) {
    return project.dir;
  }
  return remoteJoin(project.dir, path.relative(localCwd, cwd));
}

export function resolveLaunchPlan(options, rawRegistry = {}, cwd = process.cwd()) {
  if (options.help) {
    return { help: true };
  }
  const registry = normalizeRegistry(rawRegistry);
  const harnessName = asOptionalString(options.harness, "harness") ?? fail("--harness is required");
  const harness = registry.harnesses[harnessName];
  if (!harness) {
    fail(`Unknown harness "${harnessName}"`);
  }

  const explicitProject = options.project
    ? (registry.projects[options.project] ??
      fail(`Unknown Sprite project "${options.project}" in project registry`))
    : undefined;
  const cwdMatch = bestCwdProjectMatch(registry.projects, cwd);
  const project = explicitProject ?? cwdMatch?.project;
  if (!project && !options.dir) {
    fail("Unable to infer Sprite project from cwd; set --project or --dir");
  }

  const sprite = options.sprite ?? project?.sprite ?? registry.defaultSprite;
  if (!sprite) {
    fail("Sprite name is required; set --sprite, projects.<name>.sprite, or defaultSprite");
  }

  const remoteDir = resolveRemoteDir({
    explicitDir: options.dir,
    project,
    cwd,
    localCwd: cwdMatch && cwdMatch.project === project ? cwdMatch.localCwd : undefined,
  });

  return {
    spriteBin: options.spriteBin || "sprite",
    sprite,
    dir: remoteDir,
    harness: harnessName,
    command: harness.command,
    args: [...harness.args, ...options.adapterArgs],
    env: { ...(project?.env ?? {}), ...options.env },
    project: project?.name,
  };
}

export function buildSpriteExecArgs(plan) {
  const args = ["-s", plan.sprite, "exec", "--dir", plan.dir];
  const envEntries = Object.entries(plan.env).sort(([a], [b]) => a.localeCompare(b));
  if (envEntries.length > 0) {
    const encodedEnv = envEntries
      .map(([name, value]) => {
        if (value.includes(",")) {
          fail(`Sprite env value for ${name} cannot contain a comma`);
        }
        return `${name}=${value}`;
      })
      .join(",");
    args.push("--env", encodedEnv);
  }
  args.push("--", plan.command, ...plan.args);
  return args;
}

function exitCodeForSignal(signal) {
  const signals = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
  return 128 + (signals[signal] ?? 0);
}

export async function run(argv = process.argv.slice(2), env = process.env, cwd = process.cwd()) {
  const options = parseLauncherArgs(argv, env);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const registry = loadProjectsFile(options.projectsFile);
  const plan = resolveLaunchPlan(options, registry, cwd);
  if (options.dryRun) {
    process.stdout.write(
      `${JSON.stringify({ ...plan, spriteArgs: buildSpriteExecArgs(plan) }, null, 2)}\n`,
    );
    return 0;
  }

  const child = spawn(plan.spriteBin, buildSpriteExecArgs(plan), { stdio: "inherit" });
  const forward = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.once("SIGINT", forward);
  process.once("SIGTERM", forward);
  process.once("SIGHUP", forward);

  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", forward);
      process.removeListener("SIGTERM", forward);
      process.removeListener("SIGHUP", forward);
      resolve(code ?? exitCodeForSignal(signal));
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
