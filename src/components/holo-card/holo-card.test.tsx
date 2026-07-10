import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { HoloCard } from "./holo-card";

const baseProps = {
	imageUrl: "https://example.invalid/charizard.png",
	name: "Charizard",
	setId: "base1",
	cardNumber: "4",
};

describe("<HoloCard />", () => {
	let warnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		warnSpy.mockRestore();
	});

	test("renders the card image and labels the button by name", () => {
		const { container } = render(<HoloCard {...baseProps} />);
		const img = container.querySelector(".holo-card-image") as HTMLImageElement;
		expect(img.src).toBe("https://example.invalid/charizard.png");
		expect(img.alt).toBe("");
		const button = screen.getByRole("button", { name: "Charizard" });
		expect(button).toBeDefined();
	});

	test("applies known rarity class without warning", () => {
		const { container } = render(
			<HoloCard {...baseProps} rarity="Rare Holo VMAX" />,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("holo-vmax")).toBe(true);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("applies generic holo class and warns for unknown rarity", () => {
		const { container } = render(
			<HoloCard {...baseProps} rarity="Mythic Cosmic Tier" />,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("holo-basic")).toBe(true);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	test("applies no-foil class when rarity is missing", () => {
		const { container } = render(<HoloCard {...baseProps} />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("no-foil")).toBe(true);
	});

	test("calls onClick when the card is clicked", () => {
		let clicks = 0;
		render(<HoloCard {...baseProps} onClick={() => clicks++} />);
		fireEvent.click(screen.getByRole("button"));
		expect(clicks).toBe(1);
	});

	test("renders hoverOverlay content into the overlay slot", () => {
		render(
			<HoloCard
				{...baseProps}
				hoverOverlay={<button type="button">Action</button>}
			/>,
		);
		const action = screen.getByText("Action");
		expect(action.closest(".holo-card-overlay")).not.toBeNull();
	});

	test("emits data-rarity / data-subtypes / data-supertype for foil clip targeting", () => {
		const { container } = render(
			<HoloCard
				{...baseProps}
				rarity="Rare Holo"
				subtypes={["Stage 2"]}
				supertype="Pokémon"
			/>,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.getAttribute("data-rarity")).toBe("rare holo");
		expect(root.getAttribute("data-subtypes")).toBe("stage 2");
		expect(root.getAttribute("data-supertype")).toBe("pokémon");
	});

	test("renders the shine + glare layer divs (simey 5-layer stack)", () => {
		const { container } = render(
			<HoloCard {...baseProps} rarity="Rare Holo" />,
		);
		expect(container.querySelector(".holo-card-shine")).not.toBeNull();
		expect(container.querySelector(".holo-card-glare")).not.toBeNull();
	});

	test("does NOT render the holo shine/glare over the missing-image placeholder", () => {
		const { container } = render(
			<HoloCard
				imageUrl=""
				imageUrlSmall=""
				name="Charizard"
				cardNumber="4"
				series="Base"
				rarity="Rare Holo"
				size="grid"
			/>,
		);
		// hasImage is false → the identity placeholder shows, and the foil layers
		// must be gated off so the shine/glare never paint over bare text.
		expect(container.querySelector(".holo-card-empty")).not.toBeNull();
		expect(container.querySelector(".holo-card-shine")).toBeNull();
		expect(container.querySelector(".holo-card-glare")).toBeNull();
	});

	test("renders the holo shine/glare again once an image errors back into view is avoided (image present keeps them)", () => {
		const { container } = render(
			<HoloCard {...baseProps} rarity="Rare Holo" size="grid" />,
		);
		// With a real image, the foil layers are present.
		expect(container.querySelector(".holo-card-shine")).not.toBeNull();
		// After the image 404s to the empty state, the foil layers are gated off.
		fireEvent.error(
			container.querySelector("img.holo-card-image") as HTMLImageElement,
		);
		expect(container.querySelector(".holo-card-shine")).toBeNull();
		expect(container.querySelector(".holo-card-glare")).toBeNull();
	});

	// A SWSH promo has a real per-card CDN mask (buildFoilUrls resolves for
	// swsh/sv/pgo). The mask preloads via `new Image()`; the card must paint NO
	// foil until it lands, else the :not(.masked) procedural recipe flashes a
	// full-rectangle foil for a beat (reported on the modal card).
	const maskedProps = {
		imageUrl: "https://example.invalid/rillaboom.png",
		name: "Rillaboom V",
		setId: "swshp",
		cardNumber: "SWSH014",
		rarity: "Rare Holo V",
		subtypes: ["Basic", "V"],
		supertype: "Pokémon",
	};

	test("withholds the foil layers while a per-card mask is still pending", () => {
		// In the test env the mask Image never fires load, so it stays pending.
		const { container } = render(<HoloCard {...maskedProps} />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("masked")).toBe(false);
		expect(container.querySelector(".holo-card-shine")).toBeNull();
		expect(container.querySelector(".holo-card-glare")).toBeNull();
	});

	test("renders the masked foil once the per-card mask loads", () => {
		// Mock Image so onload fires synchronously when src is assigned.
		const RealImage = window.Image;
		class FakeImage {
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			set src(_v: string) {
				this.onload?.();
			}
		}
		(window as unknown as { Image: unknown }).Image = FakeImage;
		try {
			const { container } = render(<HoloCard {...maskedProps} />);
			const root = container.querySelector(".holo-card") as HTMLElement;
			expect(root.classList.contains("masked")).toBe(true);
			expect(root.style.getPropertyValue("--mask")).toContain("poke-holo");
			expect(container.querySelector(".holo-card-shine")).not.toBeNull();
			expect(container.querySelector(".holo-card-glare")).not.toBeNull();
		} finally {
			(window as unknown as { Image: unknown }).Image = RealImage;
		}
	});

	test("an unmasked set never withholds the foil (no pending window)", () => {
		// base1 has no CDN asset (buildFoilUrls → null), so it must paint the
		// procedural foil immediately — no false pending gate.
		const { container } = render(
			<HoloCard {...baseProps} rarity="Rare Holo" />,
		);
		expect(container.querySelector(".holo-card-shine")).not.toBeNull();
	});

	test("emits effective rarity + card identity data attrs (CardProxy pipeline)", () => {
		const { container } = render(
			<HoloCard
				{...baseProps}
				setId="swsh12tg"
				cardNumber="TG05"
				rarity="Trainer Gallery Rare Holo"
				supertype="Pokémon"
				subtypes={["Basic"]}
				types={["Water"]}
			/>,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		// TG prefix stripped to the base family; gallery flagged for the TG CSS.
		expect(root.getAttribute("data-rarity")).toBe("rare holo");
		expect(root.getAttribute("data-trainer-gallery")).toBe("true");
		// data-set is normalized to the simey/CDN vocabulary (tg suffix stripped).
		expect(root.getAttribute("data-set")).toBe("swsh12");
		expect(root.getAttribute("data-number")).toBe("tg05");
		// Energy type flows in as a class for --card-glow / --foil-brightness.
		expect(root.classList.contains("water")).toBe(true);
	});

	test("reverse prop renders the reverse-holo printing", () => {
		const { container } = render(
			<HoloCard {...baseProps} rarity="Common" reverse />,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.getAttribute("data-rarity")).toBe("common reverse holo");
		expect(root.classList.contains("reverse-holo")).toBe(true);
	});

	test("reverse-only printings render the reverse foil by default", () => {
		// basep-34 Entei (WotC movie promo): variants = ["reverse"] only.
		const { container } = render(
			<HoloCard
				{...baseProps}
				rarity="Promo"
				series="Base"
				variants={["reverse"]}
			/>,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.getAttribute("data-rarity")).toBe("promo reverse holo");
		expect(root.classList.contains("reverse-holo")).toBe(true);
		// Vintage frame still applies (Base series) → vintage inverse window.
		expect(root.getAttribute("data-frame")).toBe("vintage");
	});

	test("Japanese vintage series get data-frame=vintage too", () => {
		const { container } = render(
			<HoloCard
				{...baseProps}
				rarity="Holo Rare"
				series="ポケットモンスターカードゲーム"
			/>,
		);
		expect(
			(container.querySelector(".holo-card") as HTMLElement).getAttribute(
				"data-frame",
			),
		).toBe("vintage");
	});

	test("WotC-era series get data-frame=vintage; modern series don't", () => {
		const { container } = render(
			<HoloCard {...baseProps} rarity="Rare Holo" series="Base" />,
		);
		expect(
			(container.querySelector(".holo-card") as HTMLElement).getAttribute(
				"data-frame",
			),
		).toBe("vintage");
		const modern = render(
			<HoloCard {...baseProps} rarity="Rare Holo" series="Sword & Shield" />,
		);
		expect(
			(
				modern.container.querySelector(".holo-card") as HTMLElement
			).getAttribute("data-frame"),
		).toBeNull();
	});

	test("glare-only cards omit data-rarity entirely", () => {
		const { container } = render(<HoloCard {...baseProps} rarity="Common" />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.getAttribute("data-rarity")).toBeNull();
		expect(root.getAttribute("data-trainer-gallery")).toBeNull();
	});

	test("applies size variant class", () => {
		const { container } = render(<HoloCard {...baseProps} size="focus" />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("size-focus")).toBe(true);
	});

	test("default size is 'grid'", () => {
		const { container } = render(<HoloCard {...baseProps} />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("size-grid")).toBe(true);
	});

	test("grid size renders the small image lazily", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://img/large.png"
				imageUrlSmall="https://img/small.png"
				name="Pikachu"
				size="grid"
			/>,
		);
		const img = container.querySelector(
			"img.holo-card-image",
		) as HTMLImageElement;
		expect(img.getAttribute("src")).toBe("https://img/small.png");
		expect(img.getAttribute("loading")).toBe("lazy");
		expect(img.getAttribute("decoding")).toBe("async");
	});

	test("focus size renders the large image eagerly with high priority", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://img/large.png"
				imageUrlSmall="https://img/small.png"
				name="Pikachu"
				size="focus"
			/>,
		);
		// The full-res layer (over the thumbnail placeholder) carries the large
		// URL and the eager/high-priority hints.
		const img = container.querySelector(
			"img.holo-card-image--full",
		) as HTMLImageElement;
		expect(img.getAttribute("src")).toBe("https://img/large.png");
		expect(img.getAttribute("loading")).toBe("eager");
		expect(img.getAttribute("fetchpriority")).toBe("high");
	});

	test("falls back to imageUrl when imageUrlSmall is absent", () => {
		const { container } = render(
			<HoloCard imageUrl="https://img/large.png" name="Pikachu" size="grid" />,
		);
		const img = container.querySelector(
			"img.holo-card-image",
		) as HTMLImageElement;
		expect(img.getAttribute("src")).toBe("https://img/large.png");
	});

	test("renders a WebP CDN source plus a direct fallback img (grid)", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://images.pokemontcg.io/swsh4/43_hires.png"
				imageUrlSmall="https://images.pokemontcg.io/swsh4/43.png"
				name="Pikachu"
				size="grid"
			/>,
		);
		const source = container.querySelector("source") as HTMLSourceElement;
		expect(source.getAttribute("type")).toBe("image/webp");
		expect(source.getAttribute("srcset")).toContain("wsrv.nl");
		expect(source.getAttribute("srcset")).toContain("2x");
		// Fallback img keeps the small direct URL for grids.
		const img = container.querySelector(
			"img.holo-card-image",
		) as HTMLImageElement;
		expect(img.getAttribute("src")).toBe(
			"https://images.pokemontcg.io/swsh4/43.png",
		);
	});

	test("focus picture sources the large image", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://images.pokemontcg.io/swsh4/43_hires.png"
				name="Pikachu"
				size="focus"
			/>,
		);
		const source = container.querySelector("source") as HTMLSourceElement;
		expect(source.getAttribute("srcset")).toContain(
			encodeURIComponent("https://images.pokemontcg.io/swsh4/43_hires.png"),
		);
	});

	test("focus layers a w=300 thumbnail placeholder under the full-res image", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://images.pokemontcg.io/swsh4/43_hires.png"
				name="Pikachu"
				size="focus"
			/>,
		);
		const placeholder = container.querySelector(
			".holo-card-image--placeholder",
		);
		const full = container.querySelector(".holo-card-image--full");
		expect(placeholder).not.toBeNull();
		expect(full).not.toBeNull();
		// Placeholder reuses the cached grid thumbnail (w=300), not the 734 hires.
		expect(placeholder?.getAttribute("src")).toContain("w=300");
	});

	test("grid renders a single image, no placeholder / HD layers", () => {
		const { container } = render(<HoloCard {...baseProps} size="grid" />);
		expect(container.querySelector(".holo-card-image--placeholder")).toBeNull();
		expect(container.querySelector(".holo-card-image--full")).toBeNull();
		expect(container.querySelector(".holo-card-hd")).toBeNull();
	});

	test("blank image urls render the identity empty state, no <img>/<source> (grid)", () => {
		const { container } = render(
			<HoloCard
				imageUrl=""
				imageUrlSmall=""
				name="Charizard"
				cardNumber="1"
				series="McDonald's Collection"
				size="grid"
			/>,
		);
		// No <img>/<source> at all: an empty src re-fetches the whole page (HTML
		// spec → flash) and even a non-empty CDN-wrapped blank url is a wasted 404.
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector("source")).toBeNull();
		expect(container.querySelector("picture")).toBeNull();
		// Belt-and-suspenders: nothing carries an empty src/srcSet.
		for (const img of container.querySelectorAll("img")) {
			expect(img.getAttribute("src")).not.toBe("");
		}
		for (const source of container.querySelectorAll("source")) {
			expect(source.getAttribute("srcset")).not.toBe("");
		}
		// The card frame still renders, now with the card's IDENTITY (name +
		// number + set) instead of a bare frame.
		const empty = container.querySelector(".holo-card-empty");
		expect(empty).not.toBeNull();
		expect(empty?.textContent).toContain("Charizard");
		expect(empty?.textContent).toContain("#1");
		expect(empty?.textContent).toContain("McDonald's Collection");
		expect(empty?.textContent).toContain("no image");
	});

	test("blank image urls render the identity empty state (focus)", () => {
		const { container } = render(
			<HoloCard
				imageUrl=""
				imageUrlSmall=""
				name="Charizard"
				cardNumber="1"
				series="McDonald's Collection"
				size="focus"
			/>,
		);
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector("source")).toBeNull();
		expect(container.querySelector("picture")).toBeNull();
		const empty = container.querySelector(".holo-card-empty");
		expect(empty?.textContent).toContain("Charizard");
		expect(empty?.textContent).toContain("#1");
		expect(empty?.textContent).toContain("McDonald's Collection");
	});

	test("identity empty state omits the meta row when number + series are both absent", () => {
		const { container } = render(
			<HoloCard imageUrl="" imageUrlSmall="" name="Blank" size="grid" />,
		);
		const empty = container.querySelector(".holo-card-empty");
		expect(empty?.textContent).toContain("Blank");
		expect(empty?.textContent).toContain("no image");
		// No number/series → no meta row, but never a stray "#".
		expect(container.querySelector(".holo-card-empty-meta")).toBeNull();
		expect(empty?.textContent).not.toContain("#");
	});

	test("onError on the grid image drops to the identity empty state (no broken img, no empty src) and fires once", () => {
		const { container } = render(
			<HoloCard
				{...baseProps}
				name="Charizard"
				cardNumber="4"
				series="Base"
				size="grid"
			/>,
		);
		const img = container.querySelector(
			"img.holo-card-image",
		) as HTMLImageElement;
		expect(img).not.toBeNull();

		fireEvent.error(img);

		// After the load failure the image (and its <picture>) is gone — replaced by
		// the IDENTITY empty state, not a broken-image icon.
		expect(container.querySelector("img.holo-card-image")).toBeNull();
		expect(container.querySelector("picture")).toBeNull();
		// Nothing left with an empty src/srcSet.
		for (const el of container.querySelectorAll("img")) {
			expect(el.getAttribute("src")).not.toBe("");
		}
		// Reaches the same identity state: name + number visible.
		const empty = container.querySelector(".holo-card-empty");
		expect(empty?.textContent).toContain("Charizard");
		expect(empty?.textContent).toContain("#4");
		// Frame is intact.
		expect(container.querySelector(".holo-card")).not.toBeNull();
	});

	test("onError on the focus image drops to the identity empty state", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://img/large.png"
				name="Pikachu"
				cardNumber="58"
				series="Base"
				size="focus"
			/>,
		);
		const img = container.querySelector(
			"img.holo-card-image--full",
		) as HTMLImageElement;
		expect(img).not.toBeNull();

		fireEvent.error(img);

		expect(container.querySelector("img.holo-card-image--full")).toBeNull();
		expect(container.querySelector("picture")).toBeNull();
		const empty = container.querySelector(".holo-card-empty");
		expect(empty?.textContent).toContain("Pikachu");
		expect(empty?.textContent).toContain("#58");
		expect(container.querySelector(".holo-card")).not.toBeNull();
	});

	// --- localized-image reconciliation (Phase 1b C3) ---

	test("a localized image 404 swaps to the baked EN fallback (grid)", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://assets.tcgdex.net/fr/swsh/swsh4/43/low.webp"
				imageUrlSmall="https://assets.tcgdex.net/fr/swsh/swsh4/43/low.webp"
				imageUrlFallback="https://images.pokemontcg.io/swsh4/43.png"
				name="Pikachu"
				cardNumber="43"
				size="grid"
			/>,
		);
		let img = container.querySelector(
			"img.holo-card-image",
		) as HTMLImageElement;
		expect(img.getAttribute("src")).toBe(
			"https://assets.tcgdex.net/fr/swsh/swsh4/43/low.webp",
		);

		// Localized webp 404s → retry the EN fallback, not the empty state.
		fireEvent.error(img);

		img = container.querySelector("img.holo-card-image") as HTMLImageElement;
		expect(img).not.toBeNull();
		expect(img.getAttribute("src")).toBe(
			"https://images.pokemontcg.io/swsh4/43.png",
		);
		// The <source> also switched to the EN url (no stale localized webp).
		const source = container.querySelector("source") as HTMLSourceElement;
		expect(source.getAttribute("srcset")).toContain(
			encodeURIComponent("https://images.pokemontcg.io/swsh4/43.png"),
		);
		expect(container.querySelector(".holo-card-empty")).toBeNull();
	});

	test("when the EN fallback ALSO 404s, drops to the identity empty state (loop-safe)", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://assets.tcgdex.net/fr/swsh/swsh4/43/low.webp"
				imageUrlFallback="https://images.pokemontcg.io/swsh4/43.png"
				name="Pikachu"
				cardNumber="43"
				series="Vivid Voltage"
				size="grid"
			/>,
		);
		// 1st error: localized → EN fallback.
		fireEvent.error(
			container.querySelector("img.holo-card-image") as HTMLImageElement,
		);
		const fallbackImg = container.querySelector(
			"img.holo-card-image",
		) as HTMLImageElement;
		expect(fallbackImg.getAttribute("src")).toBe(
			"https://images.pokemontcg.io/swsh4/43.png",
		);
		// 2nd error: EN also fails → empty state, and we DON'T loop back to localized.
		fireEvent.error(fallbackImg);
		expect(container.querySelector("img.holo-card-image")).toBeNull();
		const empty = container.querySelector(".holo-card-empty");
		expect(empty?.textContent).toContain("Pikachu");
		expect(empty?.textContent).toContain("#43");
	});

	test("focus localized 404 swaps the full-res image to the EN fallback", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://assets.tcgdex.net/fr/swsh/swsh4/43/high.webp"
				imageUrlFallback="https://images.pokemontcg.io/swsh4/43_hires.png"
				name="Pikachu"
				cardNumber="43"
				size="focus"
			/>,
		);
		const full = container.querySelector(
			"img.holo-card-image--full",
		) as HTMLImageElement;
		fireEvent.error(full);
		const swapped = container.querySelector(
			"img.holo-card-image--full",
		) as HTMLImageElement;
		expect(swapped.getAttribute("src")).toBe(
			"https://images.pokemontcg.io/swsh4/43_hires.png",
		);
		expect(container.querySelector(".holo-card-empty")).toBeNull();
	});

	test("with no fallback, a single image error still drops straight to empty (EN path unchanged)", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://img/large.png"
				name="Pikachu"
				cardNumber="58"
				size="grid"
			/>,
		);
		fireEvent.error(
			container.querySelector("img.holo-card-image") as HTMLImageElement,
		);
		expect(container.querySelector("img.holo-card-image")).toBeNull();
		expect(container.querySelector(".holo-card-empty")).not.toBeNull();
	});

	// --- localized grid fallback keeps LOW-res, not hi-res (Bug A) ---

	test("grid localized 404 falls back to the EN LOW-res url when a small fallback is given", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://assets.tcgdex.net/de/base/base1/1/high.webp"
				imageUrlSmall="https://assets.tcgdex.net/de/base/base1/1/low.webp"
				imageUrlFallback="https://assets.tcgdex.net/en/base/base1/1/high.webp"
				imageUrlSmallFallback="https://assets.tcgdex.net/en/base/base1/1/low.webp"
				name="Alakazam"
				cardNumber="1"
				size="grid"
			/>,
		);
		let img = container.querySelector(
			"img.holo-card-image",
		) as HTMLImageElement;
		expect(img.getAttribute("src")).toBe(
			"https://assets.tcgdex.net/de/base/base1/1/low.webp",
		);

		fireEvent.error(img);

		img = container.querySelector("img.holo-card-image") as HTMLImageElement;
		// Grid keeps a THUMBNAIL: fall back to EN low.webp, never the hi-res.
		expect(img.getAttribute("src")).toBe(
			"https://assets.tcgdex.net/en/base/base1/1/low.webp",
		);
	});

	// --- EN fallback badge is IMAGE-driven, shown in grid AND focus (Bug B) ---

	test("grid shows an EN badge only after the localized image falls back to English", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://assets.tcgdex.net/de/base/base1/1/low.webp"
				imageUrlSmall="https://assets.tcgdex.net/de/base/base1/1/low.webp"
				imageUrlFallback="https://assets.tcgdex.net/en/base/base1/1/high.webp"
				imageUrlSmallFallback="https://assets.tcgdex.net/en/base/base1/1/low.webp"
				name="Alakazam"
				cardNumber="1"
				size="grid"
			/>,
		);
		// Localized image assumed present → not yet a fallback → no badge.
		expect(screen.queryByText("EN")).toBeNull();

		fireEvent.error(
			container.querySelector("img.holo-card-image") as HTMLImageElement,
		);

		expect(screen.getByText("EN")).toBeDefined();
	});

	test("an Asian card falling back to the Japanese base shows a JA badge, not EN", () => {
		// Korean scan 404s → falls back to the ja base print. The badge must read the
		// base from the fallback url (ja), not hardcode English.
		const { container } = render(
			<HoloCard
				imageUrl="https://assets.tcgdex.net/ko/SV/SV3a/1/low.webp"
				imageUrlSmall="https://assets.tcgdex.net/ko/SV/SV3a/1/low.webp"
				imageUrlFallback="https://assets.tcgdex.net/ja/SV/SV3a/1/high.webp"
				imageUrlSmallFallback="https://assets.tcgdex.net/ja/SV/SV3a/1/low.webp"
				name="ユキメノコ"
				cardNumber="1"
				size="grid"
			/>,
		);
		fireEvent.error(
			container.querySelector("img.holo-card-image") as HTMLImageElement,
		);
		expect(screen.getByText("JA")).toBeDefined();
		expect(screen.queryByText("EN")).toBeNull();
		expect(
			container
				.querySelector(".holo-card-lang-badge")
				?.getAttribute("aria-label"),
		).toBe("Shown in Japanese");
	});

	test("an English card (no fallback url) never shows the EN badge", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://img/large.png"
				imageUrlSmall="https://img/small.png"
				name="Pikachu"
				cardNumber="1"
				size="grid"
			/>,
		);
		expect(screen.queryByText("EN")).toBeNull();
		// Even when the sole url errors → empty state, still never an EN badge.
		fireEvent.error(
			container.querySelector("img.holo-card-image") as HTMLImageElement,
		);
		expect(screen.queryByText("EN")).toBeNull();
	});

	test("focus shows an EN badge after the localized full-res image falls back", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://assets.tcgdex.net/de/base/base1/1/high.webp"
				imageUrlFallback="https://assets.tcgdex.net/en/base/base1/1/high.webp"
				name="Alakazam"
				cardNumber="1"
				size="focus"
			/>,
		);
		expect(screen.queryByText("EN")).toBeNull();

		fireEvent.error(
			container.querySelector("img.holo-card-image--full") as HTMLImageElement,
		);

		expect(screen.getByText("EN")).toBeDefined();
	});

	test("EN badge disappears if the EN fallback ALSO fails (empty state)", () => {
		const { container } = render(
			<HoloCard
				imageUrl="https://assets.tcgdex.net/de/base/base1/1/low.webp"
				imageUrlSmall="https://assets.tcgdex.net/de/base/base1/1/low.webp"
				imageUrlFallback="https://assets.tcgdex.net/en/base/base1/1/high.webp"
				imageUrlSmallFallback="https://assets.tcgdex.net/en/base/base1/1/low.webp"
				name="Alakazam"
				cardNumber="1"
				size="grid"
			/>,
		);
		// 1st error: localized → EN low fallback + badge.
		fireEvent.error(
			container.querySelector("img.holo-card-image") as HTMLImageElement,
		);
		expect(screen.getByText("EN")).toBeDefined();
		// 2nd error: EN low also fails → empty identity state, badge gone.
		fireEvent.error(
			container.querySelector("img.holo-card-image") as HTMLImageElement,
		);
		expect(screen.queryByText("EN")).toBeNull();
	});
});
