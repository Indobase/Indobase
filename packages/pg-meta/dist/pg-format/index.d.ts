interface PgFormatConfigPattern {
    ident: string;
    literal: string;
    string: string;
}
export interface PgFormatConfig {
    pattern: PgFormatConfigPattern;
}
export declare function ident(value?: unknown): string;
export declare function literal(value?: unknown): string;
export declare function string(value?: unknown): string;
export declare function config(cfg: PgFormatConfig): void;
export declare function withArray(fmt: string, parameters: unknown[]): string;
export declare function format(fmt: string, ...arguments_: unknown[]): string;
export {};
//# sourceMappingURL=index.d.ts.map