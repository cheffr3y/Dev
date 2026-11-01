import { groupedVenueChoices, type VenueChoice } from "@/lib/venues/venue-directory";
import { Fragment } from "react";

// Identical company choices in server and client forms. Current legacy values
// stay selectable when editing, so an unrelated save cannot reassign history.
export function VenueOptions({ venues, current, includeLegacy = false }: {
  venues: VenueChoice[]; current?: VenueChoice | null; includeLegacy?: boolean;
}) {
  return <>{groupedVenueChoices(venues, current, includeLegacy).map((group, index) => {
    const options = group.options.map(venue => <option key={venue.id} value={venue.id}>{venue.name}{venue.standardKey === null ? " (legacy)" : ""}</option>);
    return group.label ? <optgroup key={group.label} label={group.label}>{options}</optgroup> : <Fragment key={index}>{options}</Fragment>;
  })}</>;
}
