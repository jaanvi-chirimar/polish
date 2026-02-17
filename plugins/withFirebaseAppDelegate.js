const { withAppDelegate } = require('@expo/config-plugins');

/**
 * Adds Firebase initialization to the Swift AppDelegate for expo-firebase-recaptcha (phone auth).
 */
function withFirebaseAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    const { contents, language } = config.modResults;
    if (language !== 'swift') {
      return config;
    }

    let newContents = contents;

    // Add Firebase import after first import (Expo, ExpoModulesCore, etc.)
    if (!newContents.includes('import Firebase')) {
      newContents = newContents.replace(
        /(import Expo\b)/,
        '$1\nimport Firebase'
      );
    }

    // Add FirebaseApp.configure() after bindReactNativeFactory(factory) and before window setup
    if (!newContents.includes('FirebaseApp.configure()')) {
      newContents = newContents.replace(
        /(bindReactNativeFactory\(factory\))\s*\n/,
        '$1\n\n    FirebaseApp.configure()\n\n'
      );
    }

    config.modResults.contents = newContents;
    return config;
  });
}

module.exports = withFirebaseAppDelegate;
