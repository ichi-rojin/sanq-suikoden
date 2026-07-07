// 責務: 依存規則の機械強制（層分離。02-architecture.md §4準拠）
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-domain-outward",
      severity: "error",
      comment:
        "domain層はdomainのみに依存できる（application/infrastructure/presentationへの依存禁止）",
      from: { path: "^packages/core/src/domain" },
      to: {
        path:
          "^packages/core/src/(application|infrastructure)|^packages/(cli|viewer)/src|^tools/[^/]+/src",
      },
    },
    {
      name: "no-domain-node-core",
      severity: "error",
      comment: "domain層はNode組込みモジュール（fs/path等）を参照できない",
      from: { path: "^packages/core/src/domain" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "no-application-to-infrastructure",
      severity: "error",
      comment: "application層はinfrastructure具象を参照できない（依存性逆転）",
      from: { path: "^packages/core/src/application" },
      to: { path: "^packages/core/src/infrastructure" },
    },
    {
      name: "no-core-to-cli-viewer-tools",
      severity: "error",
      comment: "core（domain/application/infrastructure）はcli/viewer/toolsに依存できない",
      from: { path: "^packages/core/src" },
      to: { path: "^packages/(cli|viewer)/src|^tools/[^/]+/src" },
    },
    {
      name: "no-viewer-to-core-cli-tools",
      severity: "error",
      comment:
        "viewer（環境シェル期）はcore/cli/toolsに依存できない（M3以降もobservatory公開APIのみ許可）",
      from: { path: "^packages/viewer/src" },
      to: { path: "^packages/core/src|^packages/cli/src|^tools/[^/]+/src" },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".js"],
    },
    tsConfig: {
      fileName: "tsconfig.base.json",
    },
  },
};
