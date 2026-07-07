// 責務: ID型のコンパイル時混同を防ぐブランド型ユーティリティ
export type Brand<T, B extends string> = T & { readonly __brand: B };
