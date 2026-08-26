const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Xcode's newer toolchain turns on folly's coroutine path while the coroutine
// headers are not vendored, so pods fail to compile with
// "'folly/coro/Coroutine.h' file not found". fmt hits a related consteval
// error. Both are switched off here for every pod, which is what the verified
// fix does. Nothing else in the Podfile is touched.
const BLOCK = `
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      defs = config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
      defs << 'FMT_USE_CONSTEVAL=0' if target.name == 'fmt'
      defs << 'FOLLY_CFG_NO_COROUTINES=1'
      defs << 'FOLLY_HAS_COROUTINES=0'
    end
  end
`;

module.exports = function withFollyCoroutinesOff(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let src = fs.readFileSync(podfile, "utf8");
      if (src.includes("FOLLY_HAS_COROUTINES=0")) return cfg;
      const marker = "post_install do |installer|";
      const at = src.indexOf(marker);
      if (at === -1) {
        throw new Error("withFollyCoroutinesOff: no post_install block in Podfile");
      }
      const insertAt = at + marker.length;
      src = src.slice(0, insertAt) + BLOCK + src.slice(insertAt);
      fs.writeFileSync(podfile, src);
      return cfg;
    },
  ]);
};
