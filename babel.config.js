// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
    plugins: [
      // Keep this LAST per Reanimated docs
      "react-native-reanimated/plugin",
    ],
  };
};

