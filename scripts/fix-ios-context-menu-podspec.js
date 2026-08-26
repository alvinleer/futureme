// react-native-ios-context-menu and react-native-ios-utilities each declare an
// explicit `s.dependency 'RCT-Folly', folly_version` in their podspec, gated on
// `ENV['RCT_USE_RN_DEP'] != '1'`. On React Native's newer "prebuilt
// dependencies" architecture (visible in EAS build logs as
// "[ReactNativeDependencies] Using release tarball"), Folly's symbols ship
// inside the prebuilt ReactNativeDependencies.xcframework tarball and RCT-Folly
// is no longer published as a standalone resolvable podspec at ANY version —
// so even patching the version number to match RN's own folly_config (the
// previous version of this script) still fails, because there is nothing to
// resolve to, matching or not.
//
// EAS Build does not set RCT_USE_RN_DEP=1 for this project, so these two
// libraries take the legacy branch and try (and fail) to add a pod dependency
// that cannot be satisfied. The fix is to remove that dependency line entirely
// for both podspecs — Folly headers are still available at compile time via
// the prebuilt ReactNativeDependencies framework, so these libraries build
// fine without the explicit pod dependency.
//
// Both packages must be patched (see prior note): CocoaPods reports the
// failure against react-native-ios-context-menu because it depends on
// react-native-ios-utilities, but the stale/unsatisfiable dependency can live
// in either podspec.
//
// This runs on every install (postinstall), so it self-heals across bun
// installs and EAS Build.
const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

const PODSPECS = [
  ["react-native-ios-context-menu", "react-native-ios-context-menu.podspec"],
  ["react-native-ios-utilities", "react-native-ios-utilities.podspec"],
];

for (const [pkg, file] of PODSPECS) {
  const podspecPath = path.join(projectRoot, "node_modules", pkg, file);
  if (!fs.existsSync(podspecPath)) {
    continue;
  }

  const podspec = fs.readFileSync(podspecPath, "utf8");
  // Remove the whole "s.dependency 'RCT-Folly', folly_version" line (and any
  // leading whitespace/newline) so it's never evaluated during pod install.
  const patched = podspec.replace(/[ \t]*s\.dependency\s+'RCT-Folly',\s*folly_version\s*\n/, "");

  if (patched !== podspec) {
    fs.writeFileSync(podspecPath, patched);
    console.log(`[fix-ios-podspecs] ${pkg}: removed unresolvable RCT-Folly pod dependency`);
  }
}
