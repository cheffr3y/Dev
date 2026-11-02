"use client";
import type { ReactNode } from "react";
import type { PrepGroup } from "@/lib/prep/prep-worksheet";
import { WorksheetRow, type Ingredient, type ReviewedResult } from "./WorksheetRow";
import { useWorksheetDirtyRows } from "./useWorksheetDirtyRows";
export function DailyWorksheet({
  date,
  groups,
  ingredients, projectCodes = {}, reviewedResults = {},
}: {
  date: string;
  groups: PrepGroup[];
  ingredients: Record<string, Ingredient[]>;
  projectCodes?: Record<string, ReactNode>;
  reviewedResults?: Record<string, ReviewedResult>;
}) {
  const { dirty, markDirty } = useWorksheetDirtyRows();
  return (
    <div className="mb-6 space-y-5">
      <p className="text-sm text-zinc-500">
        {groups.length
          ? `${groups.length} items to fill in · Save each item when ready`
          : "All ordered items have results, or no prep was ordered for this day."}
        {dirty ? " · Unsaved changes" : ""}
      </p>
      {groups.map((group) => (
        <WorksheetRow
          key={group.recipeId}
          date={date}
          group={group}
          items={ingredients[group.recipeId] ?? []}
          onDirty={markDirty}
          projectCode={projectCodes[group.recipeId]}
          reviewedResult={reviewedResults[group.recipeId]}
        />
      ))}
    </div>
  );
}
