// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          jsxImportSource: "nativewind",
          unstable_transformImportMeta: true,
        },
      ],
    ],
    plugins: [
      // Keep this LAST per Reanimated docs
      "react-native-reanimated/plugin",
    ],
  };
};
