#!/usr/bin/env node
/**
 * electron-builder afterPack hook — hydrate ICU/zstd/lz4/z/etc. dylib symlinks
 * in the packaged @embedded-postgres/darwin-* native lib directories.
 *
 * @embedded-postgres ships these as a postinstall step
 * (`node scripts/hydrate-symlinks.js`) that reads `native/pg-symlinks.json`
 * and creates the symlinks. When electron-builder copies the package into the
 * .app bundle it dereferences symlinks (copying the real file content twice
 * instead of preserving the link), so we need to re-hydrate them from the
 * same manifest after copy but before codesign.
 *
 * Without these aliases dyld fails to load libicu*, libzstd, libz, etc. when
 * postgres / initdb is spawned, and embedded-postgres exits with code 1
 * before printing any useful error.
 */

import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join, dirname, relative } from "node:path";

/** @type {import('electron-builder').AfterPackContext} */
export default async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== "darwin") return;

  const appName = packager.appInfo.productFilename;
  const archs = ["darwin-arm64", "darwin-x64"];
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalMissingTarget = 0;
  const missingArchs = [];

  for (const arch of archs) {
    const pkgRoot = join(
      appOutDir,
      `${appName}.app/Contents/Resources/app.asar.unpacked/node_modules/@embedded-postgres`,
      arch,
    );
    const manifestPath = join(pkgRoot, "native/pg-symlinks.json");
    if (!existsSync(manifestPath)) {
      missingArchs.push(arch);
      continue;
    }
    /** @type {{source: string, target: string}[]} */
    const entries = JSON.parse(readFileSync(manifestPath, "utf8"));

    for (const { source, target } of entries) {
      const sourceAbs = join(pkgRoot, source);
      const targetAbs = join(pkgRoot, target);
      // `source` is the existing real file (e.g. libicudata.77.1.dylib);
      // `target` is the alias we need to create (e.g. libicudata.77.dylib).
      // hydrate-symlinks.js itself creates the link as `target` pointing at
      // the relative path back to `source` from `target`'s directory.
      if (!existsSync(sourceAbs)) {
        totalMissingTarget += 1;
        continue;
      }
      if (existsSync(targetAbs)) {
        totalSkipped += 1;
        continue;
      }
      const relSource = relative(dirname(targetAbs), sourceAbs);
      symlinkSync(relSource, targetAbs);
      totalCreated += 1;
    }
  }

  console.log(
    `[fix-postgres-symlinks] created=${totalCreated} ` +
      `skipped-existing=${totalSkipped} ` +
      `missing-source-files=${totalMissingTarget} ` +
      (missingArchs.length ? `missing-arch=${missingArchs.join(",")}` : ""),
  );
}
