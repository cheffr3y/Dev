"use client";

import { useId, type ComponentProps } from "react";
import { VENUE_DIRECTORY } from "@/lib/venue-directory";
import { Input } from "./ui";

export function LocationInput(props: ComponentProps<"input">) {
  const id = useId();
  return <><Input {...props} list={id} /><datalist id={id}>{VENUE_DIRECTORY.map(venue => <option key={venue.key} value={venue.name} />)}</datalist></>;
}
