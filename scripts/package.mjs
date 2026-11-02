#!/usr/bin/env node
/**
 * 统一打包入口。
 *
 * 产物结构：
 *   released/v<version>/
 *     ├── MarkWeave-<version>-portable.exe      便携单文件
 *     ├── MarkWeave-<version>-win-x64/          目录版（推荐日常使用）
 *     └── BUILD-INFO.json                       构建元信息
 *
 * 用法：
 *   node scripts/package.mjs            同时产出便携版与目录版
 *   node scripts/package.mjs --dir      只产目录版（快）
 *   node scripts/package.mjs --portable 只产便携版
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const wantDir = args.includes("--dir") || (!args.includes("--portable") && !args.includes("--dir"));
const wantPortable = args.includes("--portable") || !args.includes("--dir");
const onlyDir = args.includes("--dir") && !args.includes("--portable");
const onlyPortable = args.includes("--portable") && !args.includes("--dir");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const versionDir = path.join(root, "released", `v${version}`);
const stagingDir = path.join(root, ".package-staging");

const MIRRORS = {
  ELECTRON_BUILDER_BINARIES_MIRROR:
    "https://registry.npmmirror.com/-/binary/electron-builder-binaries/",
  ELECTRON_MIRROR: "https://registry.npmmirror.com/-/binary/electron/",
};

function log(msg) {
  console.log(`\x1b[36m▸\x1b[0m ${msg}`);
}

function run(cmd, cmdArgs, options = {}) {
  // Windows 上 npm/npx 是 .cmd，需要 shell 才能解析
  execFileSync(cmd, cmdArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...MIRRORS, ...(options.env || {}) },
  });
}

function sha256(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) total += fs.statSync(p).size;
    }
  };
  walk(dir);
  return total;
}

/** 递归复制，跳过不存在的源目录 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ---------------------------------------------------------------------------

log(`打包 MarkWeave v${version}`);

// 1) 前端构建（含类型检查）
log("构建前端资源…");
run("npm", ["run", "build"]);

// 2) 用 dir 目标拿到 unpacked 目录（它同时是便携版的输入）
log("生成应用目录…");
fs.rmSync(stagingDir, { recursive: true, force: true });

// Windows 上 electron-builder 解压后重命名 win-unpacked.tmp 会报 EPERM
// （杀软扫描占用句柄）。这种情况下构建其实已经完成，我们手动接管目录。
try {
  run("npx", [
    "electron-builder",
    "--win",
    "dir",
    "--config.directories.output=.package-staging",
  ]);
} catch (err) {
  const hasTmp = fs.existsSync(path.join(stagingDir, "win-unpacked.tmp"));
  if (!hasTmp) throw err;
  log("electron-builder 重命名失败，手动接管解压结果");
}

// electron-builder 可能留下 win-unpacked.tmp（Windows 上重命名失败时）
const unpacked = path.join(stagingDir, "win-unpacked");
const unpackedTmp = path.join(stagingDir, "win-unpacked.tmp");

if (!fs.existsSync(unpacked) && fs.existsSync(unpackedTmp)) {
  log("检测到 win-unpacked.tmp，接管为 win-unpacked");
  fs.mkdirSync(unpacked, { recursive: true });
  for (const name of fs.readdirSync(unpackedTmp)) {
    fs.renameSync(path.join(unpackedTmp, name), path.join(unpacked, name));
  }
  fs.rmdirSync(unpackedTmp);
}

if (!fs.existsSync(unpacked)) {
  console.error("打包失败：未生成 win-unpacked 目录");
  process.exit(1);
}

/**
 * 兜底装配：electron-builder 在 Windows 上改名失败时，
 * 只解压出了 Electron 运行时，还没写入我们的应用。
 * 这里自己完成：打 app.asar、放进 resources、把 electron.exe 改名为产品名。
 */
function ensureAppPacked(unpackedDir) {
  const resources = path.join(unpackedDir, "resources");
  const appAsar = path.join(resources, "app.asar");
  const defaultApp = path.join(resources, "default_app.asar");
  const electronExe = path.join(unpackedDir, "electron.exe");
  const productExe = path.join(unpackedDir, "MarkWeave.exe");

  const appReady = fs.existsSync(appAsar) && !fs.existsSync(electronExe);

  if (appReady) {
    // 正常路径：electron-builder 已经装配完成
    if (fs.existsSync(defaultApp)) fs.rmSync(defaultApp, { force: true });
    return;
  }

  log("应用未装配（electron-builder 提前失败），手动完成");

  // 1) 打 app.asar：只包含运行时需要的文件
  const stageApp = path.join(stagingDir, "app-source");
  fs.rmSync(stageApp, { recursive: true, force: true });
  fs.mkdirSync(stageApp, { recursive: true });

  for (const entry of ["dist", "electron"]) {
    copyDir(path.join(root, entry), path.join(stageApp, entry));
  }
  fs.copyFileSync(
    path.join(root, "package.json"),
    path.join(stageApp, "package.json")
  );

  const asarBin = path.join(root, "node_modules", ".bin", "asar");
  const asarCmd = process.platform === "win32" ? `${asarBin}.cmd` : asarBin;
  execFileSync(asarCmd, ["pack", stageApp, appAsar], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  // 2) 移除 Electron 的默认应用
  if (fs.existsSync(defaultApp)) fs.rmSync(defaultApp, { force: true });

  // 3) 把 electron.exe 改名为产品名
  if (fs.existsSync(electronExe)) {
    fs.renameSync(electronExe, productExe);
  }
}

ensureAppPacked(unpacked);

// 3) 输出目录
fs.mkdirSync(versionDir, { recursive: true });

const buildInfo = {
  product: pkg.build?.productName ?? "MarkWeave",
  version,
  builtAt: new Date().toISOString(),
  gitCommit: (() => {
    try {
      return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim();
    } catch {
      return null;
    }
  })(),
  electron: pkg.devDependencies?.electron ?? null,
  artifacts: [],
};

// 4) 目录版
if (wantDir || onlyDir) {
  const dirTarget = path.join(versionDir, `MarkWeave-${version}-win-x64`);
  log(`复制目录版 → ${path.relative(root, dirTarget)}`);

  // Windows 上若旧产物仍在运行（或被杀软占用），rmSync 会抛 EPERM。
  // 静默失败会让后续 in-place 复制产出半新半旧的目录，因此这里显式报错并给指引。
  try {
    fs.rmSync(dirTarget, { recursive: true, force: true });
  } catch (err) {
    if (err && err.code === "EPERM") {
      console.error(
        `
无法覆盖 ${path.relative(root, dirTarget)}：文件被占用。
` +
          "请先关闭正在运行的 MarkWeave，然后重新执行打包。"
      );
      process.exit(1);
    }
    throw err;
  }

  copyDir(unpacked, dirTarget);

  const exe = path.join(dirTarget, "MarkWeave.exe");
  buildInfo.artifacts.push({
    kind: "dir",
    path: path.relative(root, dirTarget).replace(/\\/g, "/"),
    executable: path.relative(root, exe).replace(/\\/g, "/"),
    bytes: dirSize(dirTarget),
    note: "免解压，启动最快；日常使用选这个",
  });
}

// 5) 便携版
if (wantPortable || onlyPortable) {
  log("生成便携单文件…");
  const tmpOut = path.join(stagingDir, "portable");
  run("npx", [
    "electron-builder",
    "--win",
    "portable",
    "--prepackaged",
    unpacked,
    "--config.directories.output=" + path.relative(root, tmpOut),
  ]);

  const produced = fs
    .readdirSync(tmpOut)
    .find((n) => n.endsWith(".exe"));
  if (!produced) {
    console.error("打包失败：未生成便携 exe");
    process.exit(1);
  }

  const dest = path.join(versionDir, `MarkWeave-${version}-portable.exe`);
  fs.copyFileSync(path.join(tmpOut, produced), dest);

  buildInfo.artifacts.push({
    kind: "portable",
    path: path.relative(root, dest).replace(/\\/g, "/"),
    bytes: fs.statSync(dest).size,
    sha256: sha256(dest),
    note: "单文件；每次启动需解压约 475MB（约 17 秒）",
  });
}

// 6) 构建信息
fs.writeFileSync(
  path.join(versionDir, "BUILD-INFO.json"),
  JSON.stringify(buildInfo, null, 2) + "\n",
  "utf8"
);

// 7) 清理暂存
fs.rmSync(stagingDir, { recursive: true, force: true });

// 8) 汇总
console.log("");
log(`完成 → ${path.relative(root, versionDir)}`);
for (const a of buildInfo.artifacts) {
  const mb = (a.bytes / 1048576).toFixed(1);
  const hash = a.sha256 ? `  sha256:${a.sha256.slice(0, 16)}…` : "";
  console.log(`   ${a.path}  (${mb} MB)${hash}`);
}
