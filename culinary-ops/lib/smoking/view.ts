import type { SmokeRunView } from "./data";
import type {
  SmokeLotData,
  SmokeReadingData,
  SmokeRunData,
  SmokeProfileData,
} from "./smoking";
export type SmokeChoices = {
  venues: { id: string; name: string }[];
  users: { id: string; name: string }[];
  recipes: { id: string; name: string; version: number }[];
  projects: { id: string; recipeName: string; contextLabel: string }[];
  profiles: { id: string; revision: number; data: SmokeProfileData }[];
};
export type RunView = Omit<
  SmokeRunView,
  | "data"
  | "businessDate"
  | "createdAt"
  | "updatedAt"
  | "lots"
  | "photos"
  | "history"
> & {
  data: SmokeRunData;
  businessDate: string;
  createdAt: string;
  updatedAt: string;
  lots: {
    id: string;
    createdById: string;
    revision: number;
    data: SmokeLotData;
    readings: {
      id: string;
      revision: number;
      data: SmokeReadingData;
      createdById: string;
      createdAt: string;
    }[];
  }[];
  photos: {
    id: string;
    lotId: string | null;
    metadata: {
      filename: string;
      mime: string;
      uploadedBy: string;
      storedBytes: number;
    };
    createdAt: string;
  }[];
  history: {
    id: string;
    entityType: string;
    entityId: string;
    revision: number;
    actorName: string;
    createdAt: string;
    reason: string;
    before: unknown;
    after: unknown;
  }[];
};
