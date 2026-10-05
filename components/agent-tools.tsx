"use client";
import { useEffect } from "react";
import { api } from "./platform-provider";
type ModelTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};
type ModelContext = {
  registerTool?: (tool: ModelTool, options: { signal: AbortSignal }) => unknown;
};
export function AgentTools() {
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "search_rovyncore_asset_records",
            title: "Search RovynCore asset records",
            description:
              "Read paginated canonical Asset Records issued through RovynCore. Results describe public records and observed facts; they are not safety ratings or endorsements. Does not connect a wallet or initiate transactions.",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", maxLength: 100 },
                creator: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
                limit: { type: "integer", minimum: 1, maximum: 100 },
              },
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            async execute(input: unknown) {
              const p = input as Record<string, unknown>;
              if (
                !p ||
                Array.isArray(p) ||
                Object.keys(p).some((k) => !["query", "creator", "limit"].includes(k)) ||
                (p.query !== undefined &&
                  (typeof p.query !== "string" || p.query.length > 100)) ||
                (p.creator !== undefined && (typeof p.creator !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(p.creator))) ||
                (p.limit !== undefined && (!Number.isInteger(p.limit) || Number(p.limit) < 1 || Number(p.limit) > 100))
              )
                throw new Error("Invalid search input");
              const params = new URLSearchParams();
              if (typeof p.query === "string") params.set("q", p.query);
              if (typeof p.creator === "string") params.set("creator", p.creator);
              if (typeof p.limit === "number") params.set("limit", String(p.limit));
              return api<Record<string, unknown>>(`v1/assets?${params}`);
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, []);
  return null;
}
