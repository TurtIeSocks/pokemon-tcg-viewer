import type { LoaderFunctionArgs } from "react-router";
import { getCardById } from "../api";

export async function cardLoader({ params }: LoaderFunctionArgs) {
	if (!params.id) throw new Response("Missing card id", { status: 400 });
	return getCardById(params.id);
}
