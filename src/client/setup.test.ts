/// <reference types="vite/client" />
import { test } from "vitest";
import { convexTest } from "convex-test";

import { componentsGeneric, defineSchema } from "convex/server";
import { register } from "../test.js";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

export const modules = import.meta.glob("./**/*.*s");

export function initConvexTest<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(schema?: Schema) {
  const t = convexTest(schema ?? defineSchema({}), modules);
  register(t);
  return t;
}
export const components = componentsGeneric() as unknown as {
  fs: ComponentApi;
};

test("setup", () => {});
