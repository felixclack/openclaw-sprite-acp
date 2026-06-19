# OpenClaw Sprite ACP

`@felixclack/openclaw-sprite-acp` ships a small launcher for running OpenClaw
ACPX coding harnesses inside a Sprite. OpenClaw stays the coordinator on the
gateway machine; Codex or Claude runs remotely through `sprite exec`.

The package is intentionally thin. ACPX still owns ACP sessions, permissions,
and model config injection. This plugin just provides an installable package and
the `openclaw-sprite-acp` command that ACPX can use as an agent override.

## Install

For local development:

```bash
openclaw plugins install --link /path/to/openclaw-sprite-acp
openclaw plugins enable sprite-acp
openclaw gateway restart
```

From the GitHub repo once it is pushed:

```bash
openclaw plugins install git:github.com/felixclack/openclaw-sprite-acp@main
openclaw plugins enable sprite-acp
openclaw gateway restart
```

## Configure ACPX

Use generic harness-shaped agent ids, such as `codex` and `claude`. Put the
project selection in the requested `cwd` and in the Sprite project registry.

For a local linked checkout, point ACPX at the checked-out bin:

```json
{
  "plugins": {
    "entries": {
      "sprite-acp": {
        "enabled": true
      },
      "acpx": {
        "enabled": true,
        "config": {
          "agents": {
            "codex": {
              "command": "node",
              "args": [
                "/path/to/openclaw-sprite-acp/bin/openclaw-sprite-acp.mjs",
                "--harness",
                "codex",
                "--projects",
                "/path/to/openclaw-config/sprite-projects.json"
              ]
            },
            "claude": {
              "command": "node",
              "args": [
                "/path/to/openclaw-sprite-acp/bin/openclaw-sprite-acp.mjs",
                "--harness",
                "claude",
                "--projects",
                "/path/to/openclaw-config/sprite-projects.json"
              ]
            }
          }
        }
      }
    }
  }
}
```

For an npm-installed copy, use `npm exec` as the ACPX command instead:

```json
{
  "command": "npm",
  "args": [
    "exec",
    "--yes",
    "--package",
    "@felixclack/openclaw-sprite-acp",
    "--",
    "openclaw-sprite-acp",
    "--harness",
    "codex",
    "--projects",
    "/path/to/openclaw-config/sprite-projects.json"
  ]
}
```

## Project registry

Create the registry file referenced by `--projects`:

```json
{
  "defaultSprite": "coding-worker-1",
  "projects": {
    "example-app": {
      "localCwds": [
        "/workspace/example-app",
        "/workspace/worktrees/example-app"
      ],
      "dir": "/home/sprite/work/example-app",
      "env": {
        "OPENCLAW_PROJECT": "example-app"
      }
    }
  }
}
```

When OpenClaw asks ACPX to start `agentId: "codex"` with
`cwd: "/workspace/example-app/app"`, the launcher picks
the longest matching `localCwd` and runs the ACP adapter under
`/home/sprite/work/example-app/app`.

The default harness commands are:

- `codex`: `npm exec --yes --package @zed-industries/codex-acp@0.15.0 -- codex-acp`
- `claude`: `npm exec --yes --package @agentclientprotocol/claude-agent-acp@0.39.0 -- claude-agent-acp`

Override them in the registry when a Sprite already has the adapter installed:

```json
{
  "defaultSprite": "coding-worker-1",
  "harnesses": {
    "codex": {
      "command": "codex-acp",
      "args": []
    }
  },
  "projects": {
    "example-app": {
      "localCwd": "/workspace/example-app",
      "dir": "/home/sprite/work/example-app"
    }
  }
}
```

## Test a route

Use `--dry-run` before wiring it into OpenClaw:

```bash
node /path/to/openclaw-sprite-acp/bin/openclaw-sprite-acp.mjs \
  --harness codex \
  --projects /path/to/openclaw-config/sprite-projects.json \
  --dry-run
```

The dry run prints the resolved Sprite name, remote directory, harness command,
environment, and final `sprite exec` argv.
