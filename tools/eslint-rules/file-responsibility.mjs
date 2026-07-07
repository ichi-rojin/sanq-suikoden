// 責務: 新規ファイル冒頭の「// 責務: 」コメントを強制するカスタムESLintルール
export const fileResponsibilityRule = {
  meta: {
    type: "problem",
    docs: {
      description: "ファイル冒頭に「// 責務: 」で始まる行コメントを必須にする",
    },
    schema: [],
    messages: {
      missing: "ファイル冒頭に「// 責務: 」で始まるコメントが必要です。",
    },
  },
  create(context) {
    return {
      Program(node) {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const first = sourceCode.getAllComments()[0];
        const isValid =
          first !== undefined &&
          first.type === "Line" &&
          first.loc.start.line === 1 &&
          first.value.trimStart().startsWith("責務:");
        if (!isValid) {
          context.report({ node, messageId: "missing" });
        }
      },
    };
  },
};
