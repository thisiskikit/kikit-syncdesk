import type { CoupangFulfillmentNextHandoffLink } from "@shared/coupang-fulfillment";
import {
  buildCsHubWorkspaceHref,
  buildFulfillmentWorkspaceHref,
  buildWorkCenterWorkspaceHref,
} from "@/lib/ops-handoff-links";

export type ResolvedShipmentHandoffLink = {
  href: string;
  label: string;
  variant?: "secondary" | "ghost";
};

type ResolveShipmentHandoffLinksInput = {
  links: readonly CoupangFulfillmentNextHandoffLink[];
  storeId?: string | null;
  query?: string | null;
};

export function resolveShipmentHandoffLinks(
  input: ResolveShipmentHandoffLinksInput,
): ResolvedShipmentHandoffLink[] {
  return input.links.map((link) => {
    const query = link.query ?? input.query ?? null;

    if (link.destination === "fulfillment") {
      return {
        href: buildFulfillmentWorkspaceHref({
          tab: link.tab ?? "worksheet",
          storeId: input.storeId,
          scope: link.scope,
          decisionStatus: link.decisionStatus,
          query,
        }),
        label: link.label,
        variant: link.variant === "ghost" ? "ghost" : "secondary",
      };
    }

    if (link.destination === "cs") {
      return {
        href: buildCsHubWorkspaceHref({
          focus: link.csFocus,
          source: link.csSource,
        }),
        label: link.label,
        variant: link.variant === "ghost" ? "ghost" : "secondary",
      };
    }

    return {
      href: buildWorkCenterWorkspaceHref({
        tab: link.workCenterTab ?? "operations",
        channel: "coupang",
        status: link.operationStatus ?? "all",
        query,
      }),
      label: link.label,
      variant: link.variant === "ghost" ? "ghost" : "secondary",
    };
  });
}
