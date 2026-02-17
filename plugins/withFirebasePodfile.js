const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withFirebasePodfile(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      // Add GoogleUtilities with modular_headers (this is already there)
      if (!podfile.includes("pod 'GoogleUtilities'")) {
        podfile = podfile.replace(
          /target ['"]polish['"] do/,
          "target 'polish' do\n  pod 'GoogleUtilities', :modular_headers => true"
        );
      }

      // Add Firebase pods after GoogleUtilities
      if (!podfile.includes("pod 'Firebase/Core'")) {
        podfile = podfile.replace(
          /pod 'GoogleUtilities', :modular_headers => true/,
          "pod 'GoogleUtilities', :modular_headers => true\n  pod 'Firebase/Core'\n  pod 'Firebase/Auth'"
        );
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};