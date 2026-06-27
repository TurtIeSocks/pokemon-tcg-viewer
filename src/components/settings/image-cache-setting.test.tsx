import { afterEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { useImageCache } from "@/store/offline-images/images-runtime";
import { ImageCacheSetting } from "./image-cache-setting";

afterEach(() => {
	useImageCache.setState({
		thumbCap: 2000,
		thumbs: 0,
		hires: 0,
		bytes: 0,
		status: "idle",
	});
});

test("shows cached stats and a clear control", () => {
	useImageCache.setState({
		thumbCap: 2000,
		thumbs: 12,
		hires: 3,
		bytes: 5_000_000,
		status: "idle",
	});
	render(<ImageCacheSetting />);
	expect(screen.getByText(/12/)).toBeTruthy(); // thumbnail count surfaced
	expect(screen.getByText(/clear|evict/i)).toBeTruthy();
});

test("shows the image cache heading when cache is empty", () => {
	useImageCache.setState({
		thumbCap: 500,
		thumbs: 0,
		hires: 0,
		bytes: 0,
		status: "idle",
	});
	render(<ImageCacheSetting />);
	// Heading always present
	expect(screen.getByText(/image cache/i)).toBeTruthy();
	// Clear button always present when not clearing
	expect(screen.getByText(/clear|evict/i)).toBeTruthy();
});

test("shows clearing label when status is clearing", () => {
	useImageCache.setState({
		thumbCap: 2000,
		thumbs: 12,
		hires: 3,
		bytes: 5_000_000,
		status: "clearing",
	});
	render(<ImageCacheSetting />);
	expect(screen.getByText(/clearing/i)).toBeTruthy();
});
