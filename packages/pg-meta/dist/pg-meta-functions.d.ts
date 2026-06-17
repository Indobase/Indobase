import { z } from 'zod';
export declare const pgFunctionZod: z.ZodObject<{
    id: z.ZodNumber;
    schema: z.ZodString;
    name: z.ZodString;
    language: z.ZodString;
    definition: z.ZodString;
    complete_statement: z.ZodString;
    args: z.ZodArray<z.ZodObject<{
        mode: z.ZodUnion<[z.ZodLiteral<"in">, z.ZodLiteral<"out">, z.ZodLiteral<"inout">, z.ZodLiteral<"variadic">, z.ZodLiteral<"table">]>;
        name: z.ZodString;
        type_id: z.ZodNumber;
        has_default: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }, {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }>, "many">;
    argument_types: z.ZodString;
    identity_argument_types: z.ZodString;
    return_type_id: z.ZodNumber;
    return_type: z.ZodString;
    return_type_relation_id: z.ZodUnion<[z.ZodNumber, z.ZodNull]>;
    is_set_returning_function: z.ZodBoolean;
    behavior: z.ZodUnion<[z.ZodLiteral<"IMMUTABLE">, z.ZodLiteral<"STABLE">, z.ZodLiteral<"VOLATILE">]>;
    security_definer: z.ZodBoolean;
    config_params: z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodString>, z.ZodNull]>;
}, "strip", z.ZodTypeAny, {
    id: number;
    schema: string;
    name: string;
    language: string;
    definition: string;
    complete_statement: string;
    args: {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }[];
    argument_types: string;
    identity_argument_types: string;
    return_type_id: number;
    return_type: string;
    return_type_relation_id: number | null;
    is_set_returning_function: boolean;
    behavior: "IMMUTABLE" | "STABLE" | "VOLATILE";
    security_definer: boolean;
    config_params: Record<string, string> | null;
}, {
    id: number;
    schema: string;
    name: string;
    language: string;
    definition: string;
    complete_statement: string;
    args: {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }[];
    argument_types: string;
    identity_argument_types: string;
    return_type_id: number;
    return_type: string;
    return_type_relation_id: number | null;
    is_set_returning_function: boolean;
    behavior: "IMMUTABLE" | "STABLE" | "VOLATILE";
    security_definer: boolean;
    config_params: Record<string, string> | null;
}>;
export type PGFunction = z.infer<typeof pgFunctionZod>;
export declare const pgFunctionArrayZod: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    schema: z.ZodString;
    name: z.ZodString;
    language: z.ZodString;
    definition: z.ZodString;
    complete_statement: z.ZodString;
    args: z.ZodArray<z.ZodObject<{
        mode: z.ZodUnion<[z.ZodLiteral<"in">, z.ZodLiteral<"out">, z.ZodLiteral<"inout">, z.ZodLiteral<"variadic">, z.ZodLiteral<"table">]>;
        name: z.ZodString;
        type_id: z.ZodNumber;
        has_default: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }, {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }>, "many">;
    argument_types: z.ZodString;
    identity_argument_types: z.ZodString;
    return_type_id: z.ZodNumber;
    return_type: z.ZodString;
    return_type_relation_id: z.ZodUnion<[z.ZodNumber, z.ZodNull]>;
    is_set_returning_function: z.ZodBoolean;
    behavior: z.ZodUnion<[z.ZodLiteral<"IMMUTABLE">, z.ZodLiteral<"STABLE">, z.ZodLiteral<"VOLATILE">]>;
    security_definer: z.ZodBoolean;
    config_params: z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodString>, z.ZodNull]>;
}, "strip", z.ZodTypeAny, {
    id: number;
    schema: string;
    name: string;
    language: string;
    definition: string;
    complete_statement: string;
    args: {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }[];
    argument_types: string;
    identity_argument_types: string;
    return_type_id: number;
    return_type: string;
    return_type_relation_id: number | null;
    is_set_returning_function: boolean;
    behavior: "IMMUTABLE" | "STABLE" | "VOLATILE";
    security_definer: boolean;
    config_params: Record<string, string> | null;
}, {
    id: number;
    schema: string;
    name: string;
    language: string;
    definition: string;
    complete_statement: string;
    args: {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }[];
    argument_types: string;
    identity_argument_types: string;
    return_type_id: number;
    return_type: string;
    return_type_relation_id: number | null;
    is_set_returning_function: boolean;
    behavior: "IMMUTABLE" | "STABLE" | "VOLATILE";
    security_definer: boolean;
    config_params: Record<string, string> | null;
}>, "many">;
export declare const pgFunctionOptionalZod: z.ZodOptional<z.ZodObject<{
    id: z.ZodNumber;
    schema: z.ZodString;
    name: z.ZodString;
    language: z.ZodString;
    definition: z.ZodString;
    complete_statement: z.ZodString;
    args: z.ZodArray<z.ZodObject<{
        mode: z.ZodUnion<[z.ZodLiteral<"in">, z.ZodLiteral<"out">, z.ZodLiteral<"inout">, z.ZodLiteral<"variadic">, z.ZodLiteral<"table">]>;
        name: z.ZodString;
        type_id: z.ZodNumber;
        has_default: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }, {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }>, "many">;
    argument_types: z.ZodString;
    identity_argument_types: z.ZodString;
    return_type_id: z.ZodNumber;
    return_type: z.ZodString;
    return_type_relation_id: z.ZodUnion<[z.ZodNumber, z.ZodNull]>;
    is_set_returning_function: z.ZodBoolean;
    behavior: z.ZodUnion<[z.ZodLiteral<"IMMUTABLE">, z.ZodLiteral<"STABLE">, z.ZodLiteral<"VOLATILE">]>;
    security_definer: z.ZodBoolean;
    config_params: z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodString>, z.ZodNull]>;
}, "strip", z.ZodTypeAny, {
    id: number;
    schema: string;
    name: string;
    language: string;
    definition: string;
    complete_statement: string;
    args: {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }[];
    argument_types: string;
    identity_argument_types: string;
    return_type_id: number;
    return_type: string;
    return_type_relation_id: number | null;
    is_set_returning_function: boolean;
    behavior: "IMMUTABLE" | "STABLE" | "VOLATILE";
    security_definer: boolean;
    config_params: Record<string, string> | null;
}, {
    id: number;
    schema: string;
    name: string;
    language: string;
    definition: string;
    complete_statement: string;
    args: {
        name: string;
        mode: "table" | "in" | "out" | "inout" | "variadic";
        type_id: number;
        has_default: boolean;
    }[];
    argument_types: string;
    identity_argument_types: string;
    return_type_id: number;
    return_type: string;
    return_type_relation_id: number | null;
    is_set_returning_function: boolean;
    behavior: "IMMUTABLE" | "STABLE" | "VOLATILE";
    security_definer: boolean;
    config_params: Record<string, string> | null;
}>>;
export declare function list({ includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
    includeSystemSchemas?: boolean;
    includedSchemas?: string[];
    excludedSchemas?: string[];
    limit?: number;
    offset?: number;
}): {
    sql: string;
    zod: typeof pgFunctionArrayZod;
};
type FunctionsRetrieveReturn = {
    sql: string;
    zod: typeof pgFunctionOptionalZod;
};
export declare function retrieve({ id }: {
    id: number;
}): FunctionsRetrieveReturn;
export declare function retrieve({ name, schema, args, }: {
    name: string;
    schema: string;
    args: string[];
}): FunctionsRetrieveReturn;
export declare const pgFunctionCreateZod: z.ZodObject<{
    name: z.ZodString;
    definition: z.ZodString;
    args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    behavior: z.ZodOptional<z.ZodEnum<["IMMUTABLE", "STABLE", "VOLATILE"]>>;
    config_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    schema: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodString>;
    return_type: z.ZodOptional<z.ZodString>;
    security_definer: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    definition: string;
    schema?: string | undefined;
    language?: string | undefined;
    args?: string[] | undefined;
    return_type?: string | undefined;
    behavior?: "IMMUTABLE" | "STABLE" | "VOLATILE" | undefined;
    security_definer?: boolean | undefined;
    config_params?: Record<string, string> | undefined;
}, {
    name: string;
    definition: string;
    schema?: string | undefined;
    language?: string | undefined;
    args?: string[] | undefined;
    return_type?: string | undefined;
    behavior?: "IMMUTABLE" | "STABLE" | "VOLATILE" | undefined;
    security_definer?: boolean | undefined;
    config_params?: Record<string, string> | undefined;
}>;
export type PGFunctionCreate = z.infer<typeof pgFunctionCreateZod>;
export declare function create({ name, schema, args, definition, return_type, language, behavior, security_definer, config_params, }: PGFunctionCreate): {
    sql: string;
    zod: z.ZodVoid;
};
export declare const pgFunctionUpdateZod: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    schema: z.ZodOptional<z.ZodString>;
    definition: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    schema?: string | undefined;
    name?: string | undefined;
    definition?: string | undefined;
}, {
    schema?: string | undefined;
    name?: string | undefined;
    definition?: string | undefined;
}>;
export type PGFunctionUpdate = z.infer<typeof pgFunctionUpdateZod>;
export declare function update(currentFunc: PGFunction, { name, schema, definition }: PGFunctionUpdate): {
    sql: string;
    zod: z.ZodVoid;
};
export declare const pgFunctionDeleteZod: z.ZodObject<{
    cascade: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    cascade?: boolean | undefined;
}, {
    cascade?: boolean | undefined;
}>;
export type PGFunctionDelete = z.infer<typeof pgFunctionDeleteZod>;
export declare function remove(func: PGFunction, { cascade }?: PGFunctionDelete): {
    sql: string;
    zod: z.ZodVoid;
};
export {};
//# sourceMappingURL=pg-meta-functions.d.ts.map