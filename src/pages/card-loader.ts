import type { LoaderFunctionArgs } from "react-router";
import { getCardById } from "../api";
import { getPrefetched } from "./card-prefetch";

export async function cardLoader({ params }: LoaderFunctionArgs) {
	if (!params.id) throw new Response("Missing card id", { status: 400 });
	return getPrefetched(params.id) ?? getCardById(params.id);
}
