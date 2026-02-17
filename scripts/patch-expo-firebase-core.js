#!/usr/bin/env node
/**
 * Applies expo-firebase-core fixes after npm install:
 * - Swift AppDelegate: skip instead of throw (plugin + plugin build)
 * - iOS: UMCore -> ExpoModulesCore (podspec, .h, .m)
 * - tsconfig: standalone so no missing expo-module-scripts
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'node_modules', 'expo-firebase-core');
if (!fs.existsSync(PKG)) {
  console.log('patch-expo-firebase-core: expo-firebase-core not installed, skipping');
  process.exit(0);
}

function patch(file, apply) {
  const full = path.join(PKG, file);
  if (!fs.existsSync(full)) return;
  let s = fs.readFileSync(full, 'utf8');
  const next = apply(s);
  if (next !== s) {
    fs.writeFileSync(full, next);
    console.log('patch-expo-firebase-core: patched', file);
  }
}

// 1) Plugin build (Swift skip)
const pluginBuildPath = path.join(PKG, 'plugin/build/withFirebaseCore.js');
if (fs.existsSync(pluginBuildPath)) {
  let s = fs.readFileSync(pluginBuildPath, 'utf8');
  if (!s.includes('Swift: skip')) {
    const bad = `            }
            else {
                // TODO: Support Swift
                throw new Error(\`Cannot add Firebase code to AppDelegate of language "\${fileInfo.language}"\`);
            }
            fs_1.default.writeFileSync(fileInfo.path, contents);`;
    const good = `                fs_1.default.writeFileSync(fileInfo.path, contents);
            }
            // Swift: skip - use a config plugin (e.g. withFirebaseAppDelegate.js) to add Firebase`;
    if (s.includes('throw new Error(`Cannot add Firebase code')) {
      s = s.replace(bad, good);
      fs.writeFileSync(pluginBuildPath, s);
      console.log('patch-expo-firebase-core: patched plugin/build/withFirebaseCore.js');
    }
  }
}

// 2) Plugin source (Swift skip)
const pluginSrcPath = path.join(PKG, 'plugin/src/withFirebaseCore.ts');
if (fs.existsSync(pluginSrcPath)) {
  let src = fs.readFileSync(pluginSrcPath, 'utf8');
  if (!src.includes('Swift: skip')) {
    const old = `      if (fileInfo.language === 'objc') {
        contents = modifyObjcAppDelegate(contents);
      } else {
        // TODO: Support Swift
        throw new Error(
          \`Cannot add Firebase code to AppDelegate of language "\${fileInfo.language}"\`
        );
      }
      fs.writeFileSync(fileInfo.path, contents);

      return config;`;
    const newBlock = `      if (fileInfo.language === 'objc') {
        contents = modifyObjcAppDelegate(contents);
        fs.writeFileSync(fileInfo.path, contents);
      }
      // Swift: skip — use a config plugin (e.g. withFirebaseAppDelegate.js) to add Firebase

      return config;`;
    if (src.includes('throw new Error(')) {
      src = src.replace(old, newBlock);
      fs.writeFileSync(pluginSrcPath, src);
      console.log('patch-expo-firebase-core: patched plugin/src/withFirebaseCore.ts');
    }
  }
}

// 3) Podspec
patch('ios/EXFirebaseCore.podspec', (s) => s.replace("s.dependency 'UMCore'", "s.dependency 'ExpoModulesCore'"));

// 4) EXFirebaseCore.h
patch('ios/EXFirebaseCore/EXFirebaseCore.h', (s) => {
  return s
    .replace('#import <UMCore/UMExportedModule.h>', '#import <ExpoModulesCore/EXExportedModule.h>')
    .replace('UMExportedModule<UMFirebaseCoreInterface>', 'EXExportedModule<UMFirebaseCoreInterface>');
});

// 5) EXFirebaseCore.m
patch('ios/EXFirebaseCore/EXFirebaseCore.m', (s) => {
  return s
    .replace('#import <UMCore/UMUtilities.h>', '#import <ExpoModulesCore/EXDefines.h>\n#import <ExpoModulesCore/EXExportedModule.h>')
    .replace('UM_EXPORT_MODULE(ExpoFirebaseCore);', 'EX_EXPORT_MODULE(ExpoFirebaseCore);')
    .replace('UMLogWarn(@"Failed to initialize Firebase app: %@", name);', 'EXLogWarn(@"Failed to initialize Firebase app: %@", name);');
});

// 6) tsconfig.json - standalone (no extends)
const tsconfigPath = path.join(PKG, 'tsconfig.json');
if (fs.existsSync(tsconfigPath)) {
  try {
    const content = fs.readFileSync(tsconfigPath, 'utf8');
    const tc = JSON.parse(content);
    if (tc.extends && tc.extends.includes('expo-module-scripts')) {
      delete tc.extends;
      tc.compilerOptions = tc.compilerOptions || {};
      Object.assign(tc.compilerOptions, {
        module: 'commonjs',
        target: 'ES2017',
        lib: ['ES2017'],
        strict: true,
        skipLibCheck: true,
        declaration: true,
        esModuleInterop: true,
        moduleResolution: 'node',
        noEmit: false,
      });
      fs.writeFileSync(tsconfigPath, JSON.stringify(tc, null, 2));
      console.log('patch-expo-firebase-core: patched tsconfig.json');
    }
  } catch (err) {
    console.log('patch-expo-firebase-core: could not parse tsconfig.json, skipping');
  }
}

// 7) plugin/tsconfig.json - standalone
const pluginTcPath = path.join(PKG, 'plugin/tsconfig.json');
if (fs.existsSync(pluginTcPath)) {
  try {
    const content = fs.readFileSync(pluginTcPath, 'utf8');
    const tc = JSON.parse(content);
    if (tc.extends && tc.extends.includes('expo-module-scripts')) {
      delete tc.extends;
      tc.compilerOptions = Object.assign(tc.compilerOptions || {}, {
        module: 'commonjs',
        target: 'ES2017',
        strict: true,
        skipLibCheck: true,
        declaration: true,
        esModuleInterop: true,
        moduleResolution: 'node',
      });
      fs.writeFileSync(pluginTcPath, JSON.stringify(tc, null, 2));
      console.log('patch-expo-firebase-core: patched plugin/tsconfig.json');
    }
  } catch (err) {
    console.log('patch-expo-firebase-core: could not parse plugin/tsconfig.json, skipping');
  }
}

console.log('patch-expo-firebase-core: done');