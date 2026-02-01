const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const metroResolver = require("metro-resolver");

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;
const zustandMiddlewareCjs = require.resolve("zustand/middleware");

const shimStream = path.resolve(__dirname, "src/shims/stream.js");
const shimWs = path.resolve(__dirname, "src/shims/ws.js");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "zustand/esm/middleware" || moduleName === "zustand/esm/middleware.mjs") {
    return {
      type: "sourceFile",
      filePath: zustandMiddlewareCjs,
    };
  }

  if (moduleName === "stream") {
    return {
      type: "sourceFile",
      filePath: shimStream,
    };
  }

  if (moduleName === "ws") {
    return {
      type: "sourceFile",
      filePath: shimWs,
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  return metroResolver.resolve(context, moduleName, platform);
};

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "zustand/esm/middleware": zustandMiddlewareCjs,
  "zustand/esm/middleware.mjs": zustandMiddlewareCjs,
  stream: shimStream,
  ws: shimWs,
};

module.exports = withNativeWind(config, { input: "./global.css" });
