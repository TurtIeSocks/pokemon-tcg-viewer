import type { FocusCardData } from "../../server/card-mappers";
import type { HoloCardData } from "../holo-card";

/** Project the focus-card detail down to the grid/holo card shape. */
export function toHoloCardData(card: FocusCardData): HoloCardData {
	return {
		id: card.id,
		imageUrl: card.imageUrl,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		supertype: card.supertype,
		setId: card.setId,
		setName: card.setName,
		setSeries: card.setSeries,
		setReleaseDate: card.setReleaseDate,
		cardNumber: card.cardNumber,
		types: card.types,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
	};
}
