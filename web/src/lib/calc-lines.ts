import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import {
  amountsFromOverride,
  emptyAmounts,
  ownersFromKitComponents,
  type LineCalcOverride,
  type LineOwnerInput,
} from "@/lib/quote-calculation";

type BlockLike = {
  id?: string;
  type: string;
  catalogItem?: {
    owners?: CatalogOwnerValue[] | null;
    itemKind?: string | null;
  } | null;
  kit?: {
    components: {
      catalogItem?: { owners?: CatalogOwnerValue[] | null } | null;
    }[];
  } | null;
  [key: string]: unknown;
};

type OverrideLike = {
  blockId: string;
  mode: "SHARE" | "AMOUNT";
  ownersCustom: boolean;
  owners: CatalogOwnerValue[] | string[];
  amountShowMaster: number;
  amountDiakom: number;
  amountNeEvent: number;
};

export function catalogOwnersForBlock(b: BlockLike): CatalogOwnerValue[] {
  if (b.type === "ITEM" && b.catalogItem) {
    return (b.catalogItem.owners ?? []) as CatalogOwnerValue[];
  }
  if (b.type === "KIT_HEADER" && b.kit) {
    return ownersFromKitComponents(b.kit.components);
  }
  return [];
}

export function buildCalcLines(
  blocks: BlockLike[],
  overrides: OverrideLike[] = [],
): LineOwnerInput[] {
  const byBlock = new Map(overrides.map((o) => [o.blockId, o]));
  return blocks.map((b) => {
    const catalogOwners = catalogOwnersForBlock(b);
    const ov = b.id ? byBlock.get(b.id) : undefined;
    let override: LineCalcOverride | null = null;
    if (ov) {
      override = {
        mode: ov.mode,
        ownersCustom: ov.ownersCustom,
        owners: ov.owners as CatalogOwnerValue[],
        amounts: amountsFromOverride(ov),
      };
    }
    return {
      block: {
        ...(b as LineOwnerInput["block"]),
        type: b.type as LineOwnerInput["block"]["type"],
        itemKind: b.catalogItem?.itemKind ?? null,
      },
      catalogOwners,
      override,
    };
  });
}

export function defaultLineOverride(
  catalogOwners: CatalogOwnerValue[],
  lineTotal: number,
): LineCalcOverride {
  const owners = catalogOwners;
  const amounts = emptyAmounts();
  if (owners.length > 0 && lineTotal > 0) {
    const part = Math.round(lineTotal / owners.length);
    let left = Math.round(lineTotal);
    owners.forEach((c, i) => {
      const v = i === owners.length - 1 ? left : part;
      amounts[c] = v;
      left -= v;
    });
  }
  return {
    mode: "SHARE",
    ownersCustom: false,
    owners,
    amounts,
  };
}
