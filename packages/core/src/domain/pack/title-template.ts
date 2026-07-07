// 責務: 題テンプレの構文解析（パックスキーマ設計書§2.8）。プレースホルダ置換のみを受理し、条件分岐・演算は構文エラーとする（凍結条件）
export interface TitleTemplateLiteralSegment {
  readonly kind: "literal";
  readonly text: string;
}

export interface TitleTemplatePlaceholderSegment {
  readonly kind: "placeholder";
  readonly name: string;
}

export interface TitleTemplateAlternationSegment {
  readonly kind: "alternation";
  readonly options: readonly string[];
}

export type TitleTemplateSegment =
  | TitleTemplateAlternationSegment
  | TitleTemplateLiteralSegment
  | TitleTemplatePlaceholderSegment;

export interface TitleTemplateParseSuccess {
  readonly ok: true;
  readonly segments: readonly TitleTemplateSegment[];
}

export interface TitleTemplateParseFailure {
  readonly ok: false;
  readonly error: string;
}

export type TitleTemplateParseResult = TitleTemplateParseFailure | TitleTemplateParseSuccess;

const FORBIDDEN_CHARACTERS = /[!%&()*+,\-/:;<=>?]/u;

function validateOption(option: string, position: number): string | undefined {
  if (option.length === 0) {
    return `空の選択肢は許可されません（位置${position}）`;
  }
  if (FORBIDDEN_CHARACTERS.test(option)) {
    return `条件分岐・演算に類する記号は許可されません（位置${position}）`;
  }
  return undefined;
}

export function parseTitleTemplate(raw: string): TitleTemplateParseResult {
  const segments: TitleTemplateSegment[] = [];
  let literalBuffer = "";
  let index = 0;

  while (index < raw.length) {
    const char = raw.charAt(index);
    if (char === "}") {
      return { ok: false, error: `対応しない '}' が位置${index}にあります` };
    }
    if (char !== "{") {
      literalBuffer += char;
      index += 1;
      continue;
    }
    if (literalBuffer.length > 0) {
      segments.push({ kind: "literal", text: literalBuffer });
      literalBuffer = "";
    }
    const closeIndex = raw.indexOf("}", index + 1);
    if (closeIndex === -1) {
      return { ok: false, error: `対応する '}' が見つかりません（位置${index}）` };
    }
    const content = raw.slice(index + 1, closeIndex);
    if (content.includes("{")) {
      return { ok: false, error: `プレースホルダの入れ子は許可されません（位置${index}）` };
    }
    if (content.includes("|")) {
      const options = content.split("|");
      for (const option of options) {
        const error = validateOption(option, index);
        if (error !== undefined) {
          return { ok: false, error };
        }
      }
      segments.push({ kind: "alternation", options });
    } else {
      const error = validateOption(content, index);
      if (error !== undefined) {
        return { ok: false, error };
      }
      segments.push({ kind: "placeholder", name: content });
    }
    index = closeIndex + 1;
  }
  if (literalBuffer.length > 0) {
    segments.push({ kind: "literal", text: literalBuffer });
  }
  return { ok: true, segments };
}
