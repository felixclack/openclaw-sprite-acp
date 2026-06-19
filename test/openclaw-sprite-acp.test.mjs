import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpriteExecArgs,
  parseLauncherArgs,
  resolveLaunchPlan,
} from "../bin/openclaw-sprite-acp.mjs";

test("infers the Sprite project from cwd and preserves subdirectories", () => {
  const options = parseLauncherArgs(["--harness", "codex", "-c", "model=gpt-5.4"], {});
  const plan = resolveLaunchPlan(
    options,
    {
      defaultSprite: "coding-worker",
      projects: {
        app: {
          localCwd: "/workspace/app",
          dir: "/home/sprite/work/app",
          env: { PROJECT_NAME: "app" },
        },
      },
    },
    "/workspace/app/packages/web",
  );

  assert.deepEqual(plan, {
    spriteBin: "sprite",
    sprite: "coding-worker",
    dir: "/home/sprite/work/app/packages/web",
    harness: "codex",
    command: "npm",
    args: [
      "exec",
      "--yes",
      "--package",
      "@zed-industries/codex-acp@0.15.0",
      "--",
      "codex-acp",
      "-c",
      "model=gpt-5.4",
    ],
    env: { PROJECT_NAME: "app" },
    project: "app",
  });
});

test("uses explicit project and command-line overrides", () => {
  const options = parseLauncherArgs(
    ["--harness=claude", "--project", "api", "--sprite", "worker-2", "--env", "MODE=debug"],
    {},
  );
  const plan = resolveLaunchPlan(
    options,
    {
      projects: {
        api: {
          sprite: "worker-1",
          dir: "/srv/api",
          env: { MODE: "normal", PROJECT_NAME: "api" },
        },
      },
    },
    "/tmp/no-local-match",
  );

  assert.deepEqual(buildSpriteExecArgs(plan), [
    "-s",
    "worker-2",
    "exec",
    "--dir",
    "/srv/api",
    "--env",
    "MODE=debug,PROJECT_NAME=api",
    "--",
    "npm",
    "exec",
    "--yes",
    "--package",
    "@agentclientprotocol/claude-agent-acp@0.39.0",
    "--",
    "claude-agent-acp",
  ]);
});

test("allows registry-provided harness commands", () => {
  const options = parseLauncherArgs(["--harness", "codex", "--dir", "/repo"], {});
  const plan = resolveLaunchPlan(
    options,
    {
      defaultSprite: "coding-worker",
      harnesses: {
        codex: { command: "codex-acp", args: ["--verbose"] },
      },
    },
    "/workspace/app",
  );

  assert.equal(plan.command, "codex-acp");
  assert.deepEqual(plan.args, ["--verbose"]);
});

test("strips OpenClaw lease args before forwarding adapter args", () => {
  const options = parseLauncherArgs(
    [
      "--harness",
      "codex",
      "--openclaw-acpx-lease-id",
      "lease-1",
      "--openclaw-gateway-instance-id",
      "gateway-1",
      "-c",
      "model_reasoning_effort=medium",
    ],
    {},
  );

  assert.deepEqual(options.adapterArgs, ["-c", "model_reasoning_effort=medium"]);
});

test("strips OpenClaw lease args after the adapter separator", () => {
  const options = parseLauncherArgs(
    [
      "--harness",
      "codex",
      "--",
      "--openclaw-acpx-lease-id",
      "lease-1",
      "--openclaw-gateway-instance-id",
      "gateway-1",
      "-c",
      "model=gpt-5.4",
    ],
    {},
  );

  assert.deepEqual(options.adapterArgs, ["-c", "model=gpt-5.4"]);
});

test("requires project routing when no remote dir is provided", () => {
  const options = parseLauncherArgs(["--harness", "codex"], {});

  assert.throws(
    () => resolveLaunchPlan(options, {}, "/workspace/app"),
    /Unable to infer Sprite project from cwd/,
  );
});

test("rejects comma-separated Sprite env values", () => {
  const options = parseLauncherArgs(["--harness", "codex", "--dir", "/repo", "--env", "A=a,b"], {
    OPENCLAW_SPRITE_NAME: "coding-worker",
  });
  const plan = resolveLaunchPlan(options, {}, "/workspace/app");

  assert.throws(() => buildSpriteExecArgs(plan), /cannot contain a comma/);
});
