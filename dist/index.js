const emptyConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

export default {
  id: "sprite-acp",
  name: "Sprite ACP Launcher",
  description: "Sprite-backed ACP launcher command for OpenClaw ACPX agent overrides.",
  configSchema: emptyConfigSchema,
  register() {
    // Runtime behavior is intentionally owned by the package bin.
  },
};
